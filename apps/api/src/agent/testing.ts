/** Test helpers: a scripted model, so the loop can be tested without the API. */
import type { Message, ModelClient, ModelRequest } from './model-client.js';

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };

export function fakeMessage(
  content: Block[],
  stopReason: Message['stop_reason'] = content.some((b) => b.type === 'tool_use')
    ? 'tool_use'
    : 'end_turn',
): Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'fake-model',
    content,
    stop_reason: stopReason,
    usage: { input_tokens: 100, output_tokens: 20 },
  } as unknown as Message;
}

export const text = (value: string): Block => ({ type: 'text', text: value });
export const toolUse = (name: string, input: unknown = {}, id = `toolu_${name}`): Block => ({
  type: 'tool_use',
  id,
  name,
  input,
});

/** Returns the scripted responses in order and records every request it received. */
export class ScriptedModel implements ModelClient {
  readonly requests: ModelRequest[] = [];

  constructor(private readonly script: (Message | ((request: ModelRequest) => Message))[]) {}

  async generate(request: ModelRequest, onText?: (delta: string) => void): Promise<Message> {
    // Copy: the loop keeps appending to the same array after this call.
    this.requests.push({ ...request, messages: [...request.messages] });
    const next = this.script[this.requests.length - 1];
    if (!next) throw new Error('ScriptedModel ran out of responses.');
    const message = typeof next === 'function' ? next(request) : next;
    for (const block of message.content) {
      if (block.type === 'text') onText?.(block.text);
    }
    return message;
  }
}
