import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
import { auditLog, conversations, customers, messages } from '../db/schema.js';
import { Clock } from '../streambox/rules.js';
import { buildSystemPrompt, type Language } from '../streambox/system-prompt.js';
import { StreamboxTools } from '../streambox/tools.js';

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
}

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
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(MODEL_CLIENT) private readonly model: ModelClient,
    private readonly tools: StreamboxTools,
    private readonly clock: Clock,
    private readonly config: ConfigService,
  ) {}

  async chat(input: ChatInput, onEvent?: (event: AgentEvent) => void): Promise<ChatResult> {
    const startedAt = Date.now();
    const conversationId = await this.resolveConversation(input);

    // The model has no memory. Its "memory" is this list, loaded from our
    // database and sent in full on every request.
    const history = await this.loadHistory(conversationId);
    const userMessage: MessageParam = { role: 'user', content: input.message };
    const context = { customerId: input.customerId, conversationId };

    const run = await runAgent({
      model: this.model,
      system: buildSystemPrompt(this.clock.now(), input.language),
      tools: this.tools.all(),
      messages: [...history, userMessage],
      context,
      maxSteps: Number(this.config.get('AGENT_MAX_STEPS') ?? 8),
      onEvent,
      onToolExecuted: async (execution) => {
        await this.db.insert(auditLog).values({
          customerId: context.customerId,
          conversationId,
          actor: 'agent',
          action: execution.name,
          input: execution.input,
          result: { ok: execution.ok, kind: execution.tool?.kind ?? 'unknown', data: execution.result },
        });
      },
    });

    const newMessages = [userMessage, ...run.newMessages];
    const last = run.newMessages.at(-1);
    let reply = last?.role === 'assistant' ? textOf(last) : '';
    const fallback = FALLBACK_REPLIES[input.language ?? 'en'][run.stopReason];
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
    return {
      conversationId,
      reply,
      stopReason: run.stopReason,
      steps: run.steps,
      model,
      usage: run.usage,
      costUsd: estimateCostUsd(model, run.usage),
      latencyMs: Date.now() - startedAt,
    };
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
