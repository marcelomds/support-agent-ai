import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq } from 'drizzle-orm';
import {
  runAgent,
  textOf,
  type AgentEvent,
  type StopReason,
} from '../agent/agent-loop.js';
import {
  MODEL_CLIENT,
  type MessageParam,
  type ModelClient,
} from '../agent/model-client.js';
import { estimateCostUsd, type Usage } from '../agent/usage.js';
import { DB, type Database } from '../db/database.module.js';
import { agentRuns, auditLog, conversations, customers, messages } from '../db/schema.js';
import { Clock } from '../streambox/rules.js';
import { buildSystemPrompt, type Language } from '../streambox/system-prompt.js';
import { StreamboxTools } from '../streambox/tools.js';
import { PendingActionsService, type ActionCard } from './pending-actions.service.js';

export interface ChatInput {
  customerId: number;
  conversationId?: string;
  message: string;
  /** The language the customer chose in the UI. Defaults to English. */
  language?: Language;
}

export interface ChatResult {
  conversationId: string;
  reply: string;
  stopReason: StopReason;
  steps: number;
  model: string;
  usage: Usage;
  costUsd: number | null;
  latencyMs: number;
  /** Set when the agent proposed an action that now waits for the customer's button press. */
  pendingAction?: ActionCard;
}

export interface DecisionInput {
  customerId: number;
  actionId: string;
  decision: 'confirm' | 'decline';
  language?: Language;
}

/** What the chat streams to the UI: the agent's events plus the confirmation card. */
export type ChatEvent = AgentEvent | { type: 'action_pending'; action: ActionCard };

/** What the customer sees when the agent could not finish normally. */
type Fallbacks = Partial<Record<StopReason, string>>;
const FALLBACK_REPLIES: Record<Language, Fallbacks> = {
  en: {
    max_steps: "I wasn't able to finish this request. Please try again, or contact support@streambox.example.",
    refusal: "I can't help with that request. I can help with your StreamBox account, billing and policies.",
    truncated: 'My answer was cut short. Could you ask again, perhaps one question at a time?',
  },
  pt: {
    max_steps: 'Não consegui concluir este pedido. Tente de novo ou escreva para support@streambox.example.',
    refusal: 'Não posso ajudar com esse pedido. Posso ajudar com a sua conta, cobranças e políticas da StreamBox.',
    truncated: 'Minha resposta foi cortada. Pode perguntar de novo, talvez uma pergunta por vez?',
  },
  es: {
    max_steps: 'No pude completar esta solicitud. Inténtalo de nuevo o escribe a support@streambox.example.',
    refusal: 'No puedo ayudar con esa solicitud. Puedo ayudarte con tu cuenta, cobros y políticas de StreamBox.',
    truncated: 'Mi respuesta se cortó. ¿Puedes preguntar de nuevo, quizá una pregunta a la vez?',
  },
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(MODEL_CLIENT) private readonly model: ModelClient,
    private readonly tools: StreamboxTools,
    private readonly pendingActions: PendingActionsService,
    private readonly clock: Clock,
    private readonly config: ConfigService,
  ) {}

  /** The customer sent a message. */
  async chat(input: ChatInput, onEvent?: (event: ChatEvent) => void): Promise<ChatResult> {
    const conversationId = await this.resolveConversation(input);
    return this.runTurn(
      { customerId: input.customerId, conversationId, language: input.language },
      [{ role: 'user', content: input.message }],
      onEvent,
    );
  }

  /**
   * The customer pressed Confirm or Cancel on a confirmation card.
   * The action runs here, outside the model, and the agent is then told what
   * happened so it can report it.
   */
  async decide(input: DecisionInput, onEvent?: (event: ChatEvent) => void): Promise<ChatResult> {
    const action = await this.pendingActions.decide(
      input.actionId,
      input.customerId,
      input.decision,
      this.tools.all(),
    );
    const pressed = input.decision === 'confirm' ? 'Confirm' : 'Cancel';
    return this.runTurn(
      { customerId: input.customerId, conversationId: action.conversationId, language: input.language },
      [
        { role: 'user', content: `[The customer pressed the ${pressed} button.]` },
        // A system message inside the conversation is the application speaking,
        // not the customer. The customer cannot produce one by typing.
        {
          role: 'system',
          content:
            `Note from the application: the customer pressed ${pressed} on the pending action ` +
            `"${action.tool}". Final status: ${action.status}. Result: ${JSON.stringify(action.result)}. ` +
            'Tell the customer what happened, based only on this result.',
        },
      ],
      onEvent,
    );
  }

  private async runTurn(
    turn: { customerId: number; conversationId: string; language?: Language },
    incoming: MessageParam[],
    onEvent?: (event: ChatEvent) => void,
  ): Promise<ChatResult> {
    const startedAt = Date.now();
    const { conversationId } = turn;
    const context = { customerId: turn.customerId, conversationId };

    // The model has no memory. Its "memory" is this list, loaded from our
    // database and sent in full on every request.
    const history = await this.loadHistory(conversationId);
    let pendingAction: ActionCard | undefined;
    let toolCalls = 0;
    let toolErrors = 0;

    const run = await runAgent({
      model: this.model,
      system: buildSystemPrompt(this.clock.now(), turn.language),
      tools: this.tools.all(),
      messages: [...history, ...incoming],
      context,
      maxSteps: Number(this.config.get('AGENT_MAX_STEPS') ?? 8),
      onEvent,
      // Write tools never run from inside the conversation: they become a
      // proposal the customer confirms with a button.
      interceptWrite: async (tool, input, toolContext) => {
        const proposal = await this.pendingActions.propose(tool, input, toolContext);
        if (proposal.card) {
          pendingAction = proposal.card;
          onEvent?.({ type: 'action_pending', action: proposal.card });
        }
        return proposal.result;
      },
      onToolExecuted: async (execution) => {
        toolCalls += 1;
        if (!execution.ok) toolErrors += 1;
        await this.db.insert(auditLog).values({
          customerId: context.customerId,
          conversationId,
          actor: 'agent',
          action: execution.deferred ? `propose:${execution.name}` : execution.name,
          input: execution.input,
          result: { ok: execution.ok, kind: execution.tool?.kind ?? 'unknown', data: execution.result },
        });
      },
    });

    const newMessages = [...incoming, ...run.newMessages];
    const last = run.newMessages.at(-1);
    let reply = last?.role === 'assistant' ? textOf(last) : '';
    const fallback = FALLBACK_REPLIES[turn.language ?? 'en'][run.stopReason];
    if (fallback && (run.stopReason !== 'truncated' || !reply)) {
      reply = fallback;
      newMessages.push({ role: 'assistant', content: fallback });
      onEvent?.({ type: 'text', delta: fallback });
    }

    // Saved only after the run succeeds, so a failed request can be retried
    // without leaving half a turn in the history.
    await this.db.insert(messages).values(
      newMessages.map((m) => ({ conversationId, role: m.role, content: m.content })),
    );

    const model = this.config.get<string>('ANTHROPIC_MODEL') ?? 'claude-opus-5-5';
    const costUsd = estimateCostUsd(model, run.usage);
    const latencyMs = Date.now() - startedAt;
    await this.recordRun({
      customerId: turn.customerId,
      conversationId,
      model,
      stopReason: run.stopReason,
      modelCalls: run.steps,
      toolCalls,
      toolErrors,
      inputTokens: run.usage.inputTokens + run.usage.cacheReadTokens + run.usage.cacheWriteTokens,
      cachedTokens: run.usage.cacheReadTokens,
      outputTokens: run.usage.outputTokens,
      costMicroUsd: costUsd === null ? null : Math.round(costUsd * 1e6),
      latencyMs,
    });

    return {
      conversationId,
      reply,
      stopReason: run.stopReason,
      steps: run.steps,
      model,
      usage: run.usage,
      costUsd,
      latencyMs,
      pendingAction,
    };
  }

  /** One row and one structured log line per answer: the raw material for the metrics page. */
  private async recordRun(run: typeof agentRuns.$inferInsert) {
    this.logger.log(JSON.stringify({ event: 'agent_run', ...run }));
    try {
      await this.db.insert(agentRuns).values(run);
    } catch (error) {
      // Losing a metric must never fail the customer's request.
      this.logger.error(`Could not record the run: ${(error as Error).message}`);
    }
  }

  private async resolveConversation(input: ChatInput): Promise<string> {
    const [customer] = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, input.customerId));
    if (!customer) throw new NotFoundException('Customer not found.');

    if (input.conversationId) {
      // A conversation can only be continued by the customer who owns it.
      const [conversation] = await this.db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.id, input.conversationId),
            eq(conversations.customerId, input.customerId),
          ),
        );
      if (!conversation) throw new NotFoundException('Conversation not found.');
      return conversation.id;
    }
    const [created] = await this.db
      .insert(conversations)
      .values({ customerId: input.customerId })
      .returning({ id: conversations.id });
    return created.id;
  }

  private async loadHistory(conversationId: string): Promise<MessageParam[]> {
    const rows = await this.db
      .select({ role: messages.role, content: messages.content })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.id));
    return rows as MessageParam[];
  }
}
