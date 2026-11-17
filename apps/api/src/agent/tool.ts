/**
 * The contract between the agent loop and a domain.
 *
 * The loop knows nothing about subscriptions or refunds. It only knows that a
 * tool has a name, a description, an input schema, and a function to run.
 * Swapping the domain means passing a different list of tools.
 */
import { z } from 'zod';

/** Who the agent is acting for. Comes from the session, never from the model. */
export interface ToolContext {
  customerId: number;
  conversationId: string;
}

export interface AgentTool<Schema extends z.ZodType = z.ZodType> {
  name: string;
  /** Read by the model to decide when to call the tool. It is part of the prompt. */
  description: string;
  /** Read tools only look things up. Write tools change state and are audited. */
  kind: 'read' | 'write';
  /** What the model is allowed to send. Validated before `execute` runs. */
  schema: Schema;
  execute(input: z.infer<Schema>, ctx: ToolContext): Promise<unknown>;
  /**
   * For write tools: works out what `execute` would do, without doing it.
   * Used to show the customer exactly what they are confirming.
   */
  preview?(input: z.infer<Schema>, ctx: ToolContext): Promise<ActionPreview>;
}

export type ActionPreview =
  /** Something would change: show `details` and wait for the customer's confirmation. */
  | { confirm: true; details: Record<string, unknown> }
  /** Nothing would change (for example, the request would be denied): just report `result`. */
  | { confirm: false; result: unknown };

/** Helper that keeps the input type inferred from the schema. */
export function defineTool<Schema extends z.ZodType>(
  tool: AgentTool<Schema>,
): AgentTool {
  return tool as unknown as AgentTool;
}

/**
 * An expected failure ("payment not found", "outside the refund window").
 * The message is sent back to the model so it can explain it to the customer.
 * Anything else that is thrown is treated as a bug and hidden from the model.
 */
export class ToolError extends Error {}
