import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { INestApplication } from '@nestjs/common';
import { createMcpServer } from '../src/mcp/mcp-server.js';
import { refunds } from '../src/db/schema.js';
import type { Database } from '../src/db/database.module.js';
import { StreamboxTools } from '../src/streambox/tools.js';
import { CUSTOMER, createTestApp } from './setup.js';

// A real MCP client talking to the server through an in-memory connection.
describe('MCP server (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let reseed: () => Promise<unknown>;

  beforeAll(async () => {
    ({ app, db, reseed } = await createTestApp());
  });
  beforeEach(() => reseed());
  afterAll(() => app.close());

  async function connect(customerId: number, allowWrites = false) {
    const server = createMcpServer({
      name: 'streambox-test',
      version: '0.0.0',
      tools: app.get(StreamboxTools).all(),
      context: { customerId, conversationId: 'mcp' },
      allowWrites,
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    return client;
  }
  const textOf = (result: Awaited<ReturnType<Client['callTool']>>) =>
    (result.content as { text: string }[])[0].text;

  it('lists only the read tools by default, with their input schemas', async () => {
    const client = await connect(CUSTOMER.alice);
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'get_subscription', 'list_payments', 'list_plans', 'load_skill', 'search_policies',
    ]);
    const listPayments = tools.find((tool) => tool.name === 'list_payments')!;
    expect(listPayments.inputSchema).toMatchObject({ type: 'object', properties: { limit: { type: 'integer' } } });
  });

  it('exposes the action tools only when writes are allowed', async () => {
    const client = await connect(CUSTOMER.alice, true);
    const names = (await client.listTools()).tools.map((tool) => tool.name);

    expect(names).toEqual(expect.arrayContaining(['change_plan', 'cancel_subscription', 'request_refund']));
  });

  it('runs a tool for the customer fixed on the server, not one chosen by the client', async () => {
    const asAlice = await connect(CUSTOMER.alice);
    const asBruno = await connect(CUSTOMER.bruno);

    const alice = JSON.parse(textOf(await asAlice.callTool({ name: 'get_subscription', arguments: { customer_id: CUSTOMER.bruno } })));
    const bruno = JSON.parse(textOf(await asBruno.callTool({ name: 'get_subscription', arguments: {} })));
    expect(alice.plan.code).toBe('standard_monthly');
    expect(bruno.plan.code).toBe('premium_yearly');
  });

  it('reports invalid input, unknown tools and hidden write tools as errors', async () => {
    const client = await connect(CUSTOMER.alice);

    const invalid = await client.callTool({ name: 'list_payments', arguments: { limit: 999 } });
    expect(invalid.isError).toBe(true);
    const unknown = await client.callTool({ name: 'delete_everything', arguments: {} });
    expect(textOf(unknown)).toContain('Unknown tool');
    const hidden = await client.callTool({ name: 'cancel_subscription', arguments: {} });
    expect(hidden.isError).toBe(true);
  });

  it('applies the same business rules as the chat when writes are allowed', async () => {
    const client = await connect(CUSTOMER.bruno, true);
    const [payment] = JSON.parse(textOf(await client.callTool({ name: 'list_payments', arguments: { limit: 1 } })));
    const outcome = JSON.parse(
      textOf(await client.callTool({ name: 'request_refund', arguments: { payment_id: payment.payment_id, reason: 'too expensive' } })),
    );

    expect(outcome.outcome).toBe('pending_approval');
    expect(await db.select().from(refunds)).toMatchObject([{ status: 'pending_approval', amountCents: 22990 }]);
  });
});
