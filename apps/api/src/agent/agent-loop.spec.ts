import { z } from 'zod';
import { runAgent, textOf, type AgentEvent } from './agent-loop.js';
import { defineTool, ToolError, type ToolContext } from './tool.js';
import { fakeMessage, ScriptedModel, text, toolUse } from './testing.js';

const context: ToolContext = { customerId: 7, conversationId: 'conv-1' };
const question = [{ role: 'user' as const, content: 'How much did I pay?' }];

function paymentsTool(calls: unknown[] = []) {
  return defineTool({
    name: 'list_payments',
    kind: 'read',
    description: 'Lists payments.',
    schema: z.object({ limit: z.number().int().min(1).max(20).default(5) }),
    execute: async (input, ctx) => {
      calls.push({ input, ctx });
      return [{ amount_cents: 1599 }];
    },
  });
}

describe('runAgent', () => {
  it('returns the answer when the model does not ask for tools', async () => {
    const model = new ScriptedModel([fakeMessage([text('Hello!')])]);
    const result = await runAgent({ model, system: 's', tools: [], messages: question, context });

    expect(result.stopReason).toBe('completed');
    expect(result.steps).toBe(1);
    expect(textOf(result.newMessages.at(-1)!)).toBe('Hello!');
  });

  it('runs the requested tool and sends the result back to the model', async () => {
    const calls: unknown[] = [];
    const model = new ScriptedModel([
      fakeMessage([toolUse('list_payments', { limit: 1 }, 'toolu_1')]),
      fakeMessage([text('You paid $15.99.')]),
    ]);
    const result = await runAgent({
      model, system: 's', tools: [paymentsTool(calls)], messages: question, context,
    });

    // The tool ran with the validated input and the session's customer.
    expect(calls).toEqual([{ input: { limit: 1 }, ctx: context }]);
    // The second request contains the tool call and its result.
    const secondRequest = model.requests[1].messages;
    expect(secondRequest.at(-2)).toMatchObject({ role: 'assistant' });
    expect(secondRequest.at(-1)).toEqual({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: 'toolu_1',
        content: JSON.stringify([{ amount_cents: 1599 }]),
        is_error: false,
      }],
    });
    expect(result.steps).toBe(2);
    expect(result.usage.inputTokens).toBe(200);
  });

  it('rejects invalid tool input without running the tool', async () => {
    const calls: unknown[] = [];
    const model = new ScriptedModel([
      fakeMessage([toolUse('list_payments', { limit: 999 })]),
      fakeMessage([text('Sorry.')]),
    ]);
    const events: AgentEvent[] = [];
    await runAgent({
      model, system: 's', tools: [paymentsTool(calls)], messages: question, context,
      onEvent: (e) => events.push(e),
    });

    expect(calls).toHaveLength(0);
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool_result', ok: false }));
  });

  it('reports an unknown tool as an error result', async () => {
    const model = new ScriptedModel([
      fakeMessage([toolUse('delete_everything')]),
      fakeMessage([text('I cannot do that.')]),
    ]);
    await runAgent({ model, system: 's', tools: [], messages: question, context });

    const [toolResult] = model.requests[1].messages.at(-1)!.content as { is_error: boolean; content: string }[];
    expect(toolResult.is_error).toBe(true);
    expect(toolResult.content).toContain('Unknown tool');
  });

  it('sends a ToolError message to the model but hides unexpected errors', async () => {
    const failing = (error: Error) =>
      defineTool({
        name: 'fail', kind: 'read', description: 'Fails.', schema: z.object({}),
        execute: async () => { throw error; },
      });
    const run = async (error: Error) => {
      const model = new ScriptedModel([fakeMessage([toolUse('fail')]), fakeMessage([text('ok')])]);
      await runAgent({ model, system: 's', tools: [failing(error)], messages: question, context });
      return (model.requests[1].messages.at(-1)!.content as { content: string }[])[0].content;
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await run(new ToolError('Payment not found.'))).toContain('Payment not found.');
    expect(await run(new Error('connection string postgres://secret'))).not.toContain('secret');
  });

  it('stops at the step limit when the model keeps calling tools', async () => {
    const model = new ScriptedModel(
      Array.from({ length: 3 }, () => fakeMessage([toolUse('list_payments')])),
    );
    const result = await runAgent({
      model, system: 's', tools: [paymentsTool()], messages: question, context, maxSteps: 3,
    });

    expect(result.stopReason).toBe('max_steps');
    expect(model.requests).toHaveLength(3);
  });

  it('never runs tools from a refused message', async () => {
    const calls: unknown[] = [];
    const model = new ScriptedModel([
      fakeMessage([toolUse('list_payments')], 'refusal'),
    ]);
    const result = await runAgent({
      model, system: 's', tools: [paymentsTool(calls)], messages: question, context,
    });

    expect(result.stopReason).toBe('refusal');
    expect(calls).toHaveLength(0);
  });

  it('describes each tool to the model with a JSON schema', async () => {
    const model = new ScriptedModel([fakeMessage([text('hi')])]);
    await runAgent({ model, system: 's', tools: [paymentsTool()], messages: question, context });

    expect(model.requests[0].tools[0]).toMatchObject({
      name: 'list_payments',
      description: 'Lists payments.',
      input_schema: { type: 'object', properties: { limit: { type: 'integer' } } },
    });
  });
});
