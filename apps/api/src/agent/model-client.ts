/**
 * The only file that talks to the model provider.
 *
 * Every call is stateless: the full conversation (system prompt, tools,
 * messages) is sent each time, and the model returns one assistant message.
 */
import Anthropic from '@anthropic-ai/sdk';

export type Message = Anthropic.Beta.BetaMessage;
export type MessageParam = Anthropic.Beta.BetaMessageParam;
export type ToolDefinition = Anthropic.Beta.BetaTool;
export type ToolUseBlock = Anthropic.Beta.BetaToolUseBlock;
export type ToolResultBlock = Anthropic.Beta.BetaToolResultBlockParam;

export interface ModelRequest {
  system: string;
  tools: ToolDefinition[];
  messages: MessageParam[];
}

export interface ModelClient {
  /**
   * Sends one request and resolves with the complete assistant message.
   * `onText` receives the text as it is generated (streaming).
   */
  generate(
    request: ModelRequest,
    onText?: (delta: string) => void,
  ): Promise<Message>;
}

export const MODEL_CLIENT = Symbol('MODEL_CLIENT');

export interface AnthropicModelOptions {
  apiKey?: string;
  model: string;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  maxTokens: number;
}

export class AnthropicModelClient implements ModelClient {
  private client?: Anthropic;

  constructor(private readonly options: AnthropicModelOptions) {}

  async generate(
    request: ModelRequest,
    onText?: (delta: string) => void,
  ): Promise<Message> {
    // Created on first use so the app can start without a key configured.
    this.client ??= new Anthropic({ apiKey: this.options.apiKey });
    const stream = this.client.beta.messages.stream({
      model: this.options.model,
      max_tokens: this.options.maxTokens,
      output_config: { effort: this.options.effort },
      // If a safety classifier declines the request, the API retries it on a
      // fallback model inside the same call instead of failing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // Prompt caching: tools, system prompt and earlier messages are the
      // same on every step, so they are billed at a fraction after the first.
      cache_control: { type: 'ephemeral' },
      system: request.system,
      tools: request.tools,
      messages: request.messages,
    });
    if (onText) stream.on('text', onText);
    return stream.finalMessage();
  }
}
