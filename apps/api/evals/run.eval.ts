/**
 * Runs every eval case against the real model and writes a report.
 *
 *   pnpm --filter api evals                 all cases, once each
 *   EVAL_ONLY=refund-auto,cancel pnpm ...   only these cases
 *   EVAL_REPS=3 pnpm ...                    each case three times
 *   EVAL_MIN_SCORE=0.9 pnpm ...             fail the run below this pass rate
 *
 * Each case starts from freshly seeded data and goes through the same
 * ChatService the HTTP API uses, so the eval measures what actually ships.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { estimateCostUsd } from '../src/agent/usage.js';
import { ChatService } from '../src/chat/chat.service.js';
import type { Database } from '../src/db/database.module.js';
import { plans, refunds, subscriptions } from '../src/db/schema.js';
import { Embedder } from '../src/streambox/embedder.js';
import { PolicyIngestion } from '../src/streambox/policy-ingestion.js';
import { StreamboxTools } from '../src/streambox/tools.js';
import { CUSTOMER, createTestApp } from '../test/setup.js';
import { CASES, type EvalCase } from './cases.js';
import { Judge, gradeEndState, gradeReplies, type CheckResult, type EndState, type Transcript } from './graders.js';

const REPS = Number(process.env.EVAL_REPS ?? 1);
const ONLY = process.env.EVAL_ONLY?.split(',').map((id) => id.trim());
const MIN_SCORE = Number(process.env.EVAL_MIN_SCORE ?? 0);
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? 'claude-haiku-5-5';
const RESULTS_DIR = path.join(import.meta.dirname, 'results');

interface Row {
  id: string;
  rep: number;
  tag: EvalCase['tag'];
  description: string;
  /** 'error' means the harness failed (API error, timeout), not that the agent was wrong. */
  status: 'passed' | 'failed' | 'error';
  checks: CheckResult[];
  error?: string;
  transcript?: Transcript;
  endState?: EndState;
  modelCalls: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

const selected = CASES.filter((c) => !ONLY || ONLY.includes(c.id));

describe('agent evals', () => {
  let app: INestApplication;
  let db: Database;
  let reseed: () => Promise<unknown>;
  let chat: ChatService;
  let judge: Judge;
  let model: string;
  let writeTools: Set<string>;
  const rows: Row[] = [];

  beforeAll(async () => {
    ({ app, db, reseed } = await createTestApp(undefined, { embedder: 'real' }));
    const config = app.get(ConfigService);
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('Evals need ANTHROPIC_API_KEY in .env.');
    model = config.get<string>('ANTHROPIC_MODEL') ?? 'claude-opus-5-5';
    chat = app.get(ChatService);
    judge = new Judge(apiKey, JUDGE_MODEL);
    writeTools = new Set(app.get(StreamboxTools).all().filter((t) => t.kind === 'write').map((t) => t.name));

    // The policies the agent searches, embedded with the real model.
    const ingestion = new PolicyIngestion(db, app.get(Embedder));
    for (const document of await ingestion.listDocuments()) await ingestion.ingestDocument(document);
  });

  afterAll(async () => {
    await writeReport(rows, { model, judge });
    await app?.close();
  });

  for (const evalCase of selected) {
    for (let rep = 1; rep <= REPS; rep++) {
      it(`${evalCase.id}${REPS > 1 ? ` #${rep}` : ''}`, async () => {
        // Registered up front: if the case times out, it is reported as an error, not lost.
        const row: Row = {
          id: evalCase.id, rep, tag: evalCase.tag, description: evalCase.description,
          status: 'error', error: 'did not finish (timeout)', checks: [],
          modelCalls: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0,
        };
        rows.push(row);
        try {
          await reseed();
          const transcript = await converse(evalCase, row);
          const endState = await readEndState(CUSTOMER[evalCase.customer], transcript);
          const checks = [...gradeEndState(evalCase.expect, endState), ...gradeReplies(evalCase.expect, transcript)];
          for (const statement of evalCase.expect.judge ?? []) {
            checks.push(await judge.grade(statement, transcript));
          }
          Object.assign(row, {
            transcript, endState, checks, error: undefined,
            status: checks.every((check) => check.passed) ? 'passed' : 'failed',
          });
        } catch (error) {
          row.error = error instanceof Error ? error.message : String(error);
        }
      });
    }
  }

  it('meets the minimum score', () => {
    const scored = rows.filter((row) => row.status !== 'error');
    const score = scored.length ? scored.filter((row) => row.status === 'passed').length / scored.length : 0;
    expect(scored.length, 'no case produced a gradable result').toBeGreaterThan(0);
    expect(score).toBeGreaterThanOrEqual(MIN_SCORE);
  });

  async function converse(evalCase: EvalCase, row: Row): Promise<Transcript> {
    const transcript: Transcript = { turns: [], tools: [] };
    let conversationId: string | undefined;
    for (const message of evalCase.turns) {
      const pending: Transcript['tools'] = [];
      const result = await chat.chat(
        { customerId: CUSTOMER[evalCase.customer], conversationId, message, language: evalCase.language },
        (event) => {
          if (event.type === 'tool_call') pending.push({ name: event.name, input: event.input, ok: false, result: null });
          if (event.type === 'tool_result') Object.assign(pending.at(-1)!, { ok: event.ok, result: event.result });
        },
      );
      conversationId = result.conversationId;
      transcript.turns.push({ customer: message, agent: result.reply });
      transcript.tools.push(...pending);
      row.modelCalls += result.steps;
      row.inputTokens += result.usage.inputTokens + result.usage.cacheReadTokens + result.usage.cacheWriteTokens;
      row.cachedTokens += result.usage.cacheReadTokens;
      row.outputTokens += result.usage.outputTokens;
      row.costUsd += estimateCostUsd(model, result.usage) ?? 0;
      row.latencyMs += result.latencyMs;
    }
    return transcript;
  }

  async function readEndState(customerId: number, transcript: Transcript): Promise<EndState> {
    const created = await db
      .select({ status: refunds.status })
      .from(refunds)
      .where(eq(refunds.customerId, customerId))
      .orderBy(refunds.id);
    const allPlans = await db.select().from(plans);
    const codeOf = (id: number | null) => allPlans.find((plan) => plan.id === id)?.code ?? null;
    const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.customerId, customerId));
    return {
      refunds: created.map((refund) => refund.status),
      subscription: subscription
        ? {
            planCode: codeOf(subscription.planId)!,
            pendingPlanCode: codeOf(subscription.pendingPlanId),
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : null,
      // A denied refund request ran, but changed nothing.
      successfulWrites: transcript.tools
        .filter((tool) => writeTools.has(tool.name) && tool.ok)
        .filter((tool) => (tool.result as { outcome?: string } | null)?.outcome !== 'denied')
        .map((tool) => tool.name),
    };
  }
});

async function writeReport(rows: Row[], context: { model: string; judge: Judge }) {
  if (rows.length === 0) return;
  const scored = rows.filter((row) => row.status !== 'error');
  const passed = scored.filter((row) => row.status === 'passed').length;
  const errors = rows.length - scored.length;
  const total = (field: 'costUsd' | 'inputTokens' | 'outputTokens' | 'modelCalls' | 'latencyMs') =>
    rows.reduce((sum, row) => sum + row[field], 0);
  const score = scored.length ? passed / scored.length : 0;
  // Rough 95% margin for a pass rate measured on this few cases.
  const margin = scored.length ? 1 / Math.sqrt(scored.length) : 1;
  const judgeCost = estimateCostUsd(context.judge.model, {
    inputTokens: context.judge.usage.inputTokens, outputTokens: context.judge.usage.outputTokens,
    cacheReadTokens: 0, cacheWriteTokens: 0,
  });
  const icon = { passed: 'pass', failed: 'FAIL', error: 'error' } as const;

  const lines = [
    '# Eval results',
    '',
    `- **Score: ${passed}/${scored.length} cases passed (${(score * 100).toFixed(0)}%)**` +
      (errors ? `, plus ${errors} that could not be graded (harness errors, not agent mistakes)` : ''),
    `- Margin of error at this size: about ±${(margin * 100).toFixed(0)} points. Differences smaller than that are noise.`,
    `- Agent model: \`${context.model}\` · Judge model: \`${context.judge.model}\` · Repetitions: ${REPS}`,
    `- Agent cost: $${total('costUsd').toFixed(3)} · ${total('modelCalls')} model calls · ` +
      `${total('inputTokens').toLocaleString('en-US')} tokens in · ${total('outputTokens').toLocaleString('en-US')} out`,
    `- Judge cost: ${judgeCost === null ? 'not in the price table' : `$${judgeCost.toFixed(3)}`}`,
    `- Average time per case: ${(total('latencyMs') / rows.length / 1000).toFixed(1)}s`,
    `- Run at: ${new Date().toISOString()}`,
    '',
    '| Case | What it tests | Result | Failed checks |',
    '|---|---|---|---|',
    ...rows.map((row) => {
      const failed = row.status === 'error'
        ? row.error
        : row.checks.filter((check) => !check.passed).map((check) => `${check.check} (${check.detail})`).join('; ');
      return `| \`${row.id}\`${REPS > 1 ? ` #${row.rep}` : ''} | ${row.description} | ${icon[row.status]} | ${(failed ?? '').replaceAll('|', '/').replaceAll('\n', ' ')} |`;
    }),
    '',
  ];

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(path.join(RESULTS_DIR, 'latest.md'), lines.join('\n'));
  // Full transcripts, tool calls and judge reasons, to trace any surprising result.
  await writeFile(path.join(RESULTS_DIR, 'latest.json'), JSON.stringify({ model: context.model, judgeModel: context.judge.model, rows }, null, 2));
  console.log('\n' + lines.join('\n'));
}
