/**
 * Runs the StreamBox tools as an MCP server over standard input/output,
 * which is how desktop MCP clients start a local server.
 *
 *   MCP_CUSTOMER_ID=1 pnpm --filter api mcp:start
 *
 * MCP_CUSTOMER_ID   which sample customer the tools act for (required)
 * MCP_ALLOW_WRITES  "true" to also expose the action tools
 *
 * Standard output carries the protocol, so every log goes to standard error.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Logger } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../db/schema.js';
import { AccountService } from '../streambox/account.service.js';
import { LocalEmbedder } from '../streambox/embedder.js';
import { PolicyService } from '../streambox/policy.service.js';
import { RefundService } from '../streambox/refund.service.js';
import { SystemClock } from '../streambox/rules.js';
import { SubscriptionService } from '../streambox/subscription.service.js';
import { StreamboxTools } from '../streambox/tools.js';
import { createMcpServer } from './mcp-server.js';

const toStderr = (...parts: unknown[]) => console.error(...parts);
Logger.overrideLogger({ log: toStderr, warn: toStderr, error: toStderr, debug() {}, verbose() {} });

const customerId = Number(process.env.MCP_CUSTOMER_ID);
if (!Number.isInteger(customerId) || customerId <= 0) {
  console.error('Set MCP_CUSTOMER_ID to the id of the customer the tools act for, e.g. MCP_CUSTOMER_ID=1.');
  process.exit(1);
}

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://streambox:streambox@localhost:5432/streambox',
});
const db = drizzle(pool, { schema });
const clock = new SystemClock();

// The same services the HTTP API uses, wired by hand instead of by Nest.
const account = new AccountService(db, clock);
const tools = new StreamboxTools(
  db,
  account,
  new PolicyService(db, new LocalEmbedder(process.env.EMBEDDING_MODEL)),
  new RefundService(db, clock),
  new SubscriptionService(db, account, clock),
);

const server = createMcpServer({
  name: 'streambox-support',
  version: '0.1.0',
  tools: tools.all(),
  context: { customerId, conversationId: 'mcp' },
  allowWrites: process.env.MCP_ALLOW_WRITES === 'true',
});
await server.connect(new StdioServerTransport());
console.error(`StreamBox MCP server ready for customer ${customerId}.`);
