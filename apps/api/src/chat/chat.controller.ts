import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { Response } from 'express';
import { z } from 'zod';
import { ChatService } from './chat.service.js';

const ChatBody = z.object({
  customerId: z.number().int().positive(),
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(4000),
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
   * `text` (a piece of the answer), `tool_call`, `tool_result`, then `done`.
   */
  @Post('stream')
  async stream(@Body() body: unknown, @Res() res: Response) {
    const input = parseBody(body);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    try {
      const result = await this.chatService.chat(input, ({ type, ...data }) => send(type, data));
      send('done', result);
    } catch (error) {
      const http = toHttpError(error);
      send('error', { status: http.getStatus(), message: http.message });
    } finally {
      res.end();
    }
  }
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
