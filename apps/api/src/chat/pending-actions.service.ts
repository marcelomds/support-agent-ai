import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { ToolError, type AgentTool, type ToolContext } from '../agent/tool.js';
import { DB, type Database } from '../db/database.module.js';
import { auditLog, pendingActions } from '../db/schema.js';
import { Clock } from '../streambox/rules.js';

export type PendingAction = typeof pendingActions.$inferSelect;

/** What the UI needs to draw the confirmation card. */
export interface ActionCard {
  id: string;
  tool: string;
  preview: Record<string, unknown>;
  expiresAt: string;
}

/** How long a proposal stays valid. Prices and dates in the preview go stale. */
export const PENDING_ACTION_TTL_MS = 15 * 60 * 1000;

/**
 * The confirmation gate for actions.
 *
 * `propose` is what happens when the agent calls a write tool: the action is
 * previewed and stored, not run. `decide` is what happens when the customer
 * presses a button: only then does the tool execute, with the business rules
 * applied again at that moment.
 */
@Injectable()
export class PendingActionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  /** Returns what to tell the model, plus the card to show when confirmation is needed. */
  async propose(
    tool: AgentTool,
    input: unknown,
    context: ToolContext,
  ): Promise<{ result: unknown; card?: ActionCard }> {
    if (!tool.preview) {
      throw new Error(`Write tool "${tool.name}" has no preview, so it cannot be confirmed.`);
    }
    const preview = await tool.preview(input, context);
    if (!preview.confirm) return { result: preview.result };

    const expiresAt = new Date(this.clock.now().getTime() + PENDING_ACTION_TTL_MS);
    const action = await this.db.transaction(async (tx) => {
      // One open proposal per conversation: a new one replaces the old.
      await tx
        .update(pendingActions)
        .set({ status: 'superseded', decidedAt: this.clock.now() })
        .where(
          and(
            eq(pendingActions.conversationId, context.conversationId),
            eq(pendingActions.status, 'pending'),
          ),
        );
      const [created] = await tx
        .insert(pendingActions)
        .values({
          customerId: context.customerId,
          conversationId: context.conversationId,
          tool: tool.name,
          input,
          preview: preview.details,
          expiresAt,
        })
        .returning();
      return created;
    });

    return {
      result: {
        status: 'awaiting_customer_confirmation',
        nothing_has_changed_yet: true,
        confirmation_card_shows: preview.details,
        note: 'The customer now sees a card with Confirm and Cancel buttons. Ask them to press Confirm.',
      },
      card: {
        id: action.id,
        tool: action.tool,
        preview: preview.details,
        expiresAt: expiresAt.toISOString(),
      },
    };
  }

  /** The open proposal of a conversation, if any. */
  async findPending(conversationId: string): Promise<PendingAction | undefined> {
    const [action] = await this.db
      .select()
      .from(pendingActions)
      .where(and(eq(pendingActions.conversationId, conversationId), eq(pendingActions.status, 'pending')));
    return action;
  }

  /**
   * The customer pressed Confirm or Cancel. On Confirm the tool finally runs.
   * Returns the stored action with its outcome.
   */
  async decide(
    actionId: string,
    customerId: number,
    decision: 'confirm' | 'decline',
    tools: AgentTool[],
  ): Promise<PendingAction> {
    // Claim the action first, so two quick clicks cannot run it twice.
    const [claimed] = await this.db
      .update(pendingActions)
      .set({ status: decision === 'confirm' ? 'confirmed' : 'declined', decidedAt: this.clock.now() })
      .where(
        and(
          eq(pendingActions.id, actionId),
          // An action can only be decided by the customer it was proposed to.
          eq(pendingActions.customerId, customerId),
          eq(pendingActions.status, 'pending'),
        ),
      )
      .returning();
    if (!claimed) {
      const [existing] = await this.db
        .select({ status: pendingActions.status })
        .from(pendingActions)
        .where(and(eq(pendingActions.id, actionId), eq(pendingActions.customerId, customerId)));
      if (!existing) throw new NotFoundException('Action not found.');
      throw new ConflictException(`This action is already ${existing.status}.`);
    }

    let result: unknown = { outcome: 'declined_by_customer' };
    let status: PendingAction['status'] = claimed.status;
    if (decision === 'confirm') {
      if (claimed.expiresAt.getTime() < this.clock.now().getTime()) {
        status = 'expired';
        result = { error: 'This confirmation expired. Nothing was changed. Ask again to get a fresh one.' };
      } else {
        result = await this.execute(claimed, tools);
      }
    }

    const [updated] = await this.db
      .update(pendingActions)
      .set({ status, result })
      .where(eq(pendingActions.id, actionId))
      .returning();
    await this.db.insert(auditLog).values({
      customerId,
      conversationId: claimed.conversationId,
      actor: 'customer',
      action: `${decision}:${claimed.tool}`,
      input: claimed.input,
      result,
    });
    return updated;
  }

  private async execute(action: PendingAction, tools: AgentTool[]): Promise<unknown> {
    const tool = tools.find((candidate) => candidate.name === action.tool);
    if (!tool) return { error: `Unknown tool: ${action.tool}` };
    // The stored input was validated when proposed; validate again before acting on it.
    const input = tool.schema.safeParse(action.input);
    if (!input.success) return { error: 'The stored action is no longer valid.' };
    try {
      // The rules run again here: the account may have changed since the preview.
      return await tool.execute(input.data, {
        customerId: action.customerId,
        conversationId: action.conversationId,
      });
    } catch (error) {
      if (error instanceof ToolError) return { error: error.message };
      console.error(`Confirmed action ${action.tool} failed`, error);
      return { error: 'The action failed unexpectedly. Nothing else was changed.' };
    }
  }
}
