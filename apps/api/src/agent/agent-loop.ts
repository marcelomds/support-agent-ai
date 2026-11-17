/**
 * The agent loop, written by hand.
 *
 *   1. Send the conversation and the tool definitions to the model.
 *   2. If the model answers with text, we are done.
 *   3. If the model asks for tools, run them and append the results.
 *   4. Go back to 1, up to `maxSteps` times.
 *
 * The model never executes anything. It only returns a request ("call
 * list_payments with limit 3"); this code decides whether and how to run it.
 */
import { z } from 'zod';
import type {
  Message,
  MessageParam,
  ModelClient,
  ToolDefinition,
  ToolResultBlock,
  ToolUseBlock,
} from './model-client.js';
import { ToolError, type AgentTool, type ToolContext } from './tool.js';
import { addUsage, emptyUsage, type Usage } from './usage.js';

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; ok: boolean; result: unknown };

export type StopReason =
  | 'completed' // the model finished its answer
  | 'max_steps' // the step limit was hit before the model finished
  | 'refusal' // the model declined to answer
  | 'truncated'; // the answer hit the output token limit

export interface AgentRunInput {
  model: ModelClient;
  system: string;
  tools: AgentTool[];
  /** The conversation so far, ending with the new user message. */
  messages: MessageParam[];
  context: ToolContext;
  maxSteps?: number;
  onEvent?: (event: AgentEvent) => void;
  /** Called after every tool execution. Used for the audit trail. */
  onToolExecuted?: (record: ToolExecution) => Promise<void> | void;
}

export interface ToolExecution {
  tool: AgentTool | undefined;
  name: string;
  input: unknown;
  ok: boolean;
  result: unknown;
}

export interface AgentRunResult {
  /** Messages produced by this run, to append to the stored conversation. */
  newMessages: MessageParam[];
  stopReason: StopReason;
  steps: number;
  usage: Usage;
}

export const DEFAULT_MAX_STEPS = 8;

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS;
  const toolsByName = new Map(input.tools.map((t) => [t.name, t]));
  const toolDefinitions = input.tools.map(toToolDefinition);
  const messages = [...input.messages];
  const newMessages: MessageParam[] = [];
  let usage = emptyUsage();

  const append = (message: MessageParam) => {
    messages.push(message);
    newMessages.push(message);
  };

  for (let step = 1; step <= maxSteps; step++) {
    const response = await input.model.generate(
      { system: input.system, tools: toolDefinitions, messages },
      (delta) => input.onEvent?.({ type: 'text', delta }),
    );
    usage = addUsage(usage, response);

    const toolCalls = response.content.filter(
      (block): block is ToolUseBlock => block.type === 'tool_use',
    );
    const done = (stopReason: StopReason): AgentRunResult => {
      // Keep the whole content (not only the text): later requests must send
      // back exactly what the model produced.
      append({ role: 'assistant', content: response.content });
      return { newMessages, stopReason, steps: step, usage };
    };

    // A refused or truncated message may contain a half-written tool call.
    // Never run tools from it.
    if (response.stop_reason === 'refusal') {
      return { newMessages, stopReason: 'refusal', steps: step, usage };
    }
    if (response.stop_reason === 'max_tokens') {
      if (toolCalls.length > 0) {
        return { newMessages, stopReason: 'truncated', steps: step, usage };
      }
      return done('truncated');
    }
    if (toolCalls.length === 0) return done('completed');

    append({ role: 'assistant', content: response.content });

    // All results for one assistant message go back in a single user message.
    const results: ToolResultBlock[] = [];
    for (const call of toolCalls) {
      input.onEvent?.({ type: 'tool_call', name: call.name, input: call.input });
      const execution = await executeTool(toolsByName, call, input.context);
      await input.onToolExecuted?.(execution);
      input.onEvent?.({
        type: 'tool_result',
        name: call.name,
        ok: execution.ok,
        result: execution.result,
      });
      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: JSON.stringify(execution.result),
        is_error: !execution.ok,
      });
    }
    append({ role: 'user', content: results });
  }

  return { newMessages, stopReason: 'max_steps', steps: maxSteps, usage };
}

async function executeTool(
  toolsByName: Map<string, AgentTool>,
  call: ToolUseBlock,
  context: ToolContext,
): Promise<ToolExecution> {
  const tool = toolsByName.get(call.name);
  const base = { tool, name: call.name, input: call.input };
  if (!tool) {
    return { ...base, ok: false, result: { error: `Unknown tool: ${call.name}` } };
  }

  // The input was written by the model. Treat it like any untrusted request body.
  const parsed = tool.schema.safeParse(call.input);
  if (!parsed.success) {
    return {
      ...base,
      ok: false,
      result: { error: 'Invalid input', details: z.prettifyError(parsed.error) },
    };
  }

  try {
    const result = await tool.execute(parsed.data, context);
    return { ...base, input: parsed.data, ok: true, result };
  } catch (error) {
    if (error instanceof ToolError) {
      return { ...base, ok: false, result: { error: error.message } };
    }
    // Unexpected failure: log it, but do not leak internals to the model.
    console.error(`Tool ${call.name} failed`, error);
    return {
      ...base,
      ok: false,
      result: { error: 'The tool failed unexpectedly. Do not retry.' },
    };
  }
}

function toToolDefinition(tool: AgentTool): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: z.toJSONSchema(tool.schema) as ToolDefinition['input_schema'],
    // Tool inputs stream as they are generated; validation happens above.
    eager_input_streaming: true,
  };
}

/** The plain text of an assistant message, ignoring tool calls and thinking. */
export function textOf(message: MessageParam | Message): string {
  if (typeof message.content === 'string') return message.content;
  return (message.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}
