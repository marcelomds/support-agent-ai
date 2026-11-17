import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { Response } from 'express';
import { z } from 'zod';
import { ChatService, type ChatEvent, type ChatResult } from './chat.service.js';

const ChatBody = z.object({
  customerId: z.number().int().positive(),
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(4000),
  language: z.enum(['en', 'pt', 'es']).optional(),
});

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /** Waits for the whole answer and returns it as JSON. */
  @Post()
  async chat(@Body() body: unknown) {
    try {
      return await this.chatService.chat(parseBody(body));
    } catch (error) {
      throw toHttpError(error);
    }
  }

  /**
   * Same as POST /chat, but streams the answer as Server-Sent Events:
   * `text` (a piece of the answer), `tool_call`, `tool_result`,
   * `action_pending` (show a confirmation card), then `done`.
   */
  @Post('stream')
  async stream(@Body() body: unknown, @Res() res: Response) {
    const input = parseBody(body);
    await streamTo(res, (onEvent) => this.chatService.chat(input, onEvent));
  }

  /** The customer pressed Confirm or Cancel on a confirmation card. */
  @Post('actions/:id/decision')
  async decide(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    try {
      return await this.chatService.decide({ actionId: id, ...parseDecision(body) });
    } catch (error) {
      throw toHttpError(error);
    }
  }

  @Post('actions/:id/decision/stream')
  async decideStream(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Res() res: Response) {
    const input = { actionId: id, ...parseDecision(body) };
    await streamTo(res, (onEvent) => this.chatService.decide(input, onEvent));
  }
}

/** Runs a chat turn and writes its events to the response as Server-Sent Events. */
async function streamTo(res: Response, run: (onEvent: (event: ChatEvent) => void) => Promise<ChatResult>) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const send = (event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    const result = await run(({ type, ...data }) => send(type, data));
    send('done', result);
  } catch (error) {
    const http = toHttpError(error);
    send('error', { status: http.getStatus(), message: http.message });
  } finally {
    res.end();
  }
}

const DecisionBody = z.object({
  customerId: z.number().int().positive(),
  decision: z.enum(['confirm', 'decline']),
  language: z.enum(['en', 'pt', 'es']).optional(),
});

function parseDecision(body: unknown) {
  const parsed = DecisionBody.safeParse(body);
  if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
  return parsed.data;
}

function parseBody(body: unknown) {
  const parsed = ChatBody.safeParse(body);
  if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
  return parsed.data;
}

/** Maps model provider failures to HTTP errors the client can act on. */
function toHttpError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;
  if (error instanceof Anthropic.AuthenticationError) {
    return new ServiceUnavailableException(
      'The model API key is missing or invalid. Set ANTHROPIC_API_KEY in .env.',
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new HttpException('The model is rate limited. Try again shortly.', HttpStatus.TOO_MANY_REQUESTS);
  }
  if (error instanceof Anthropic.APIError) {
    return new BadGatewayException(`The model request failed (${error.status ?? 'network'}).`);
  }
  if (error instanceof Anthropic.AnthropicError) {
    return new ServiceUnavailableException(
      'The model client is not configured. Set ANTHROPIC_API_KEY in .env.',
    );
  }
  console.error(error);
  return new HttpException('Unexpected error.', HttpStatus.INTERNAL_SERVER_ERROR);
}
