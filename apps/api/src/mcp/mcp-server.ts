/**
 * Exposes the agent's tools over MCP (Model Context Protocol).
 *
 * MCP is a standard way for an AI application to discover and call tools.
 * The same tool definitions that feed our own agent loop are published here,
 * so any MCP client (Claude Desktop, an IDE, another agent) can use them
 * without knowing anything about this codebase.
 *
 * The protocol has two requests that matter: "list the tools" and "call this
 * tool". Both are answered below from the same `AgentTool` objects.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ToolError, type AgentTool, type ToolContext } from '../agent/tool.js';

export interface McpServerOptions {
  name: string;
  version: string;
  tools: AgentTool[];
  /**
   * Who the tools act for. An MCP connection has no chat session, so the
   * customer is fixed when the server starts, never chosen by the client.
   */
  context: ToolContext;
  /**
   * Write tools are hidden unless this is true. Over MCP there is no
   * confirmation card: the client application's own approval prompt is the
   * confirmation, so exposing actions is an explicit choice.
   */
  allowWrites?: boolean;
}

export function createMcpServer(options: McpServerOptions): Server {
  const tools = options.tools.filter((tool) => tool.kind === 'read' || options.allowWrites);
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const server = new Server(
    { name: options.name, version: options.version },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: z.toJSONSchema(tool.schema) as { type: 'object' },
      annotations: { readOnlyHint: tool.kind === 'read' },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const failure = (message: string) => ({
      isError: true,
      content: [{ type: 'text' as const, text: message }],
    });
    const tool = byName.get(request.params.name);
    if (!tool) return failure(`Unknown tool: ${request.params.name}`);

    // Same rule as in the agent loop: arguments from a model are untrusted input.
    const input = tool.schema.safeParse(request.params.arguments ?? {});
    if (!input.success) return failure(`Invalid input: ${z.prettifyError(input.error)}`);

    try {
      const result = await tool.execute(input.data, options.context);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    } catch (error) {
      if (error instanceof ToolError) return failure(error.message);
      console.error(`MCP tool ${tool.name} failed`, error);
      return failure('The tool failed unexpectedly.');
    }
  });

  return server;
}
