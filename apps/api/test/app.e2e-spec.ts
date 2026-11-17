import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { fakeMessage, ScriptedModel, text, toolUse } from '../src/agent/testing.js';
import type { Database } from '../src/db/database.module.js';
import { agentRuns, auditLog, messages, payments, pendingActions, refunds, subscriptions } from '../src/db/schema.js';
import { CUSTOMER, createTestApp } from './setup.js';

// The HTTP API end to end, with the real database and a scripted model.
describe('API (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let reseed: () => Promise<unknown>;
  let model: ScriptedModel;

  const boot = async (script: ConstructorParameters<typeof ScriptedModel>[0]) => {
    model = new ScriptedModel(script);
    ({ app, db, reseed } = await createTestApp(model));
    await reseed();
  };
  afterEach(() => app.close());

  it('GET /health reports the database as up', async () => {
    await boot([]);
    await request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok', db: 'up' });
  });

  it('POST /chat runs a tool for the signed-in customer and stores the conversation', async () => {
    await boot([
      fakeMessage([toolUse('get_subscription')]),
      fakeMessage([text('You are on Standard (monthly).')]),
    ]);

    const { body } = await request(app.getHttpServer())
      .post('/chat')
      .send({ customerId: CUSTOMER.alice, message: 'What plan am I on?' })
      .expect(201);

    expect(body).toMatchObject({ reply: 'You are on Standard (monthly).', stopReason: 'completed', steps: 2 });
    // The tool result the model received is Alice's real subscription.
    const toolResult = model.requests[1].messages.at(-1)!.content as { content: string }[];
    expect(JSON.parse(toolResult[0].content)).toMatchObject({ plan: { code: 'standard_monthly' } });
    // user, assistant (tool call), user (tool result), assistant (answer)
    const stored = await db.select().from(messages).where(eq(messages.conversationId, body.conversationId));
    expect(stored.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    const audit = await db.select().from(auditLog);
    expect(audit).toMatchObject([{ actor: 'agent', action: 'get_subscription', customerId: CUSTOMER.alice }]);
  });

  it('sends the stored history back to the model on the next message', async () => {
    await boot([fakeMessage([text('Hi Alice.')]), fakeMessage([text('Still here.')])]);
    const first = await request(app.getHttpServer())
      .post('/chat').send({ customerId: CUSTOMER.alice, message: 'Hello' }).expect(201);
    await request(app.getHttpServer())
      .post('/chat')
      .send({ customerId: CUSTOMER.alice, conversationId: first.body.conversationId, message: 'Are you there?' })
      .expect(201);

    expect(model.requests[1].messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it("does not let a customer continue someone else's conversation", async () => {
    await boot([fakeMessage([text('Hi Alice.')])]);
    const first = await request(app.getHttpServer())
      .post('/chat').send({ customerId: CUSTOMER.alice, message: 'Hello' }).expect(201);

    await request(app.getHttpServer())
      .post('/chat')
      .send({ customerId: CUSTOMER.carla, conversationId: first.body.conversationId, message: 'Show me' })
      .expect(404);
  });

  it('tells the model to answer in the language the customer chose', async () => {
    await boot([fakeMessage([text('Olá!')]), fakeMessage([text('Hello!')])]);
    await request(app.getHttpServer())
      .post('/chat').send({ customerId: CUSTOMER.alice, message: 'Oi', language: 'pt' }).expect(201);
    await request(app.getHttpServer())
      .post('/chat').send({ customerId: CUSTOMER.alice, message: 'Hi' }).expect(201);

    expect(model.requests[0].system).toContain('write every reply in Brazilian Portuguese');
    expect(model.requests[1].system).toContain('write every reply in English');
    await request(app.getHttpServer())
      .post('/chat').send({ customerId: CUSTOMER.alice, message: 'Salut', language: 'fr' }).expect(400);
  });

  it('uses the chosen language for the fallback reply', async () => {
    await boot(Array.from({ length: 8 }, () => fakeMessage([toolUse('list_plans')])));
    const { body } = await request(app.getHttpServer())
      .post('/chat').send({ customerId: CUSTOMER.alice, message: 'Bucle', language: 'es' }).expect(201);

    expect(body.reply).toContain('No pude completar');
  });

  it('GET /customers/:id/account returns the subscription and recent payments', async () => {
    await boot([]);
    const { body } = await request(app.getHttpServer()).get(`/customers/${CUSTOMER.alice}/account`).expect(200);

    expect(body).toMatchObject({
      customer: { name: 'Alice Martin' },
      subscription: { status: 'active', plan: { code: 'standard_monthly' } },
    });
    expect(body.payments).toHaveLength(2);
    await request(app.getHttpServer()).get('/customers/999/account').expect(404);
  });

  it('rejects an invalid body', async () => {
    await boot([]);
    await request(app.getHttpServer()).post('/chat').send({ customerId: 'x', message: '' }).expect(400);
  });

  it('replies with a fallback when the agent hits the step limit', async () => {
    await boot(Array.from({ length: 8 }, () => fakeMessage([toolUse('list_plans')])));
    const { body } = await request(app.getHttpServer())
      .post('/chat').send({ customerId: CUSTOMER.alice, message: 'Loop forever' }).expect(201);

    expect(body.stopReason).toBe('max_steps');
    expect(body.reply).toContain("wasn't able to finish");
  });

  it('POST /chat/stream sends text, tool and done events', async () => {
    await boot([
      fakeMessage([toolUse('list_plans')]),
      fakeMessage([text('We have three tiers.')]),
    ]);
    const response = await request(app.getHttpServer())
      .post('/chat/stream')
      .send({ customerId: CUSTOMER.alice, message: 'Which plans exist?' })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);

    const events = response.text.split('\n\n').filter(Boolean).map((chunk) => chunk.split('\n')[0]);
    expect(events).toEqual(['event: tool_call', 'event: tool_result', 'event: text', 'event: done']);
  });

  // The model asks for the last payment, then requests a refund for it.
  const refundScript = [
    fakeMessage([toolUse('list_payments', { limit: 1 })]),
    (req: { messages: { content?: unknown }[] }) => {
      const payments = JSON.parse((req.messages.at(-1)!.content as { content: string }[])[0].content);
      return fakeMessage([toolUse('request_refund', { payment_id: payments[0].payment_id, reason: 'too expensive' })]);
    },
    fakeMessage([text('Please press Confirm.')]),
  ];
  const askForRefund = (customerId: number) =>
    request(app.getHttpServer()).post('/chat').send({ customerId, message: 'Refund my last charge.' }).expect(201);
  const decide = (actionId: string, customerId: number, decision: 'confirm' | 'decline') =>
    request(app.getHttpServer()).post(`/chat/actions/${actionId}/decision`).send({ customerId, decision });

  describe('confirmation before actions', () => {
    it('does not run an action when the agent calls the tool: it waits for the button', async () => {
      await boot(refundScript);
      const { body } = await askForRefund(CUSTOMER.alice);

      expect(body.pendingAction).toMatchObject({
        tool: 'request_refund',
        preview: { outcome: 'refunded', amount_cents: 1599 },
      });
      // The model was told nothing has changed, and nothing has.
      const toolResult = model.requests[2].messages.at(-1)!.content as { content: string }[];
      expect(toolResult[0].content).toContain('awaiting_customer_confirmation');
      expect(await db.select().from(refunds)).toEqual([]);
    });

    it('runs the action when the customer confirms, and tells the agent through a system note', async () => {
      await boot([...refundScript, fakeMessage([text('Your refund was issued.')])]);
      const { body } = await askForRefund(CUSTOMER.alice);
      const confirmed = await decide(body.pendingAction.id, CUSTOMER.alice, 'confirm').expect(201);

      expect(confirmed.body.reply).toBe('Your refund was issued.');
      expect(await db.select().from(refunds)).toMatchObject([{ status: 'refunded', amountCents: 1599 }]);
      const note = model.requests[3].messages.at(-1)!;
      expect(note.role).toBe('system');
      expect(note.content).toContain('"outcome":"refunded"');
    });

    it('changes nothing when the customer cancels', async () => {
      await boot([...refundScript, fakeMessage([text('No problem.')])]);
      const { body } = await askForRefund(CUSTOMER.alice);
      await decide(body.pendingAction.id, CUSTOMER.alice, 'decline').expect(201);

      expect(await db.select().from(refunds)).toEqual([]);
      expect(model.requests[3].messages.at(-1)!.content).toContain('declined_by_customer');
    });

    it('cannot be confirmed by another customer, or twice', async () => {
      await boot([...refundScript, fakeMessage([text('Done.')])]);
      const { body } = await askForRefund(CUSTOMER.alice);

      await decide(body.pendingAction.id, CUSTOMER.carla, 'confirm').expect(404);
      expect(await db.select().from(refunds)).toEqual([]);
      await decide(body.pendingAction.id, CUSTOMER.alice, 'confirm').expect(201);
      await decide(body.pendingAction.id, CUSTOMER.alice, 'confirm').expect(409);
      expect(await db.select().from(refunds)).toHaveLength(1);
    });

    it('refuses an expired confirmation', async () => {
      await boot([...refundScript, fakeMessage([text('That confirmation expired.')])]);
      const { body } = await askForRefund(CUSTOMER.alice);
      await db
        .update(pendingActions)
        .set({ expiresAt: new Date('2020-01-01T00:00:00Z') })
        .where(eq(pendingActions.id, body.pendingAction.id));
      await decide(body.pendingAction.id, CUSTOMER.alice, 'confirm').expect(201);

      expect(await db.select().from(refunds)).toEqual([]);
      const [action] = await db.select().from(pendingActions);
      expect(action.status).toBe('expired');
    });

    it('replaces an open proposal when the agent makes a new one', async () => {
      await boot([
        fakeMessage([toolUse('cancel_subscription', {}, 'toolu_1')]),
        fakeMessage([text('Press Confirm to cancel.')]),
        fakeMessage([toolUse('change_plan', { plan_code: 'premium_monthly' }, 'toolu_2')]),
        fakeMessage([text('Press Confirm to upgrade.')]),
      ]);
      const first = await request(app.getHttpServer())
        .post('/chat').send({ customerId: CUSTOMER.alice, message: 'Cancel.' }).expect(201);
      await request(app.getHttpServer())
        .post('/chat')
        .send({ customerId: CUSTOMER.alice, conversationId: first.body.conversationId, message: 'Actually, upgrade me.' })
        .expect(201);

      const actions = await db.select().from(pendingActions).orderBy(pendingActions.createdAt);
      expect(actions.map((a) => [a.tool, a.status])).toEqual([
        ['cancel_subscription', 'superseded'],
        ['change_plan', 'pending'],
      ]);
      await decide(first.body.pendingAction.id, CUSTOMER.alice, 'confirm').expect(409);
    });

    it('answers a refund that would be denied at once, with no card', async () => {
      await boot(refundScript);
      const { body } = await askForRefund(CUSTOMER.carla);

      expect(body.pendingAction).toBeUndefined();
      const toolResult = model.requests[2].messages.at(-1)!.content as { content: string }[];
      expect(JSON.parse(toolResult[0].content)).toMatchObject({ outcome: 'denied' });
      expect(await db.select().from(pendingActions)).toEqual([]);
    });

    it('previews a plan change without applying it', async () => {
      await boot([
        fakeMessage([toolUse('change_plan', { plan_code: 'premium_monthly' })]),
        fakeMessage([text('Press Confirm.')]),
      ]);
      const { body } = await request(app.getHttpServer())
        .post('/chat').send({ customerId: CUSTOMER.alice, message: 'Upgrade me to Premium.' }).expect(201);

      expect(body.pendingAction.preview).toMatchObject({ outcome: 'applied', to_plan: 'premium_monthly', charged_now_cents: 677 });
      const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.customerId, CUSTOMER.alice));
      expect(subscription.planId).toBe(3);
      expect(await db.select().from(payments).where(eq(payments.subscriptionId, subscription.id))).toHaveLength(2);
    });
  });

  it('lets a human approve a refund the customer confirmed', async () => {
    await boot([...refundScript, fakeMessage([text('Your refund was sent for review.')])]);
    const { body } = await askForRefund(CUSTOMER.bruno);
    expect(body.pendingAction.preview).toMatchObject({ outcome: 'pending_approval', amount_cents: 22990 });
    await decide(body.pendingAction.id, CUSTOMER.bruno, 'confirm').expect(201);

    const pending = await request(app.getHttpServer()).get('/refunds?status=pending_approval').expect(200);
    expect(pending.body).toMatchObject([{ customerName: 'Bruno Costa', amountCents: 22990 }]);

    await request(app.getHttpServer())
      .post(`/refunds/${pending.body[0].id}/decision`)
      .send({ decision: 'approve', decidedBy: 'maria' })
      .expect(201);
    const after = await request(app.getHttpServer()).get('/refunds?status=pending_approval').expect(200);
    expect(after.body).toEqual([]);
    const audit = await request(app.getHttpServer()).get('/audit').expect(200);
    expect(audit.body.map((a: { action: string }) => a.action)).toEqual(
      expect.arrayContaining(['refund_approve', 'confirm:request_refund', 'propose:request_refund', 'list_payments']),
    );
  });

  it('records one run with its cost for each answer', async () => {
    await boot([fakeMessage([toolUse('list_plans')]), fakeMessage([text('Three tiers.')])]);
    await request(app.getHttpServer())
      .post('/chat').send({ customerId: CUSTOMER.alice, message: 'Which plans exist?' }).expect(201);

    expect(await db.select().from(agentRuns)).toMatchObject([
      { customerId: CUSTOMER.alice, stopReason: 'completed', modelCalls: 2, toolCalls: 1, toolErrors: 0, inputTokens: 200, outputTokens: 40 },
    ]);
  });
});
