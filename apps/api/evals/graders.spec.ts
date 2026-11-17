import { CASES } from './cases.js';
import { gradeEndState, renderForJudge, type EndState } from './graders.js';

const untouched: EndState = {
  refunds: [],
  subscription: { planCode: 'standard_monthly', pendingPlanCode: null, cancelAtPeriodEnd: false },
  successfulWrites: [],
};
const allPassed = (results: { passed: boolean }[]) => results.every((r) => r.passed);

describe('gradeEndState', () => {
  it('passes when the expected refund is the only one created', () => {
    expect(allPassed(gradeEndState({ refund: 'refunded' }, { ...untouched, refunds: ['refunded'] }))).toBe(true);
  });

  it('fails when a refund was expected and nothing happened (the do-nothing agent)', () => {
    expect(allPassed(gradeEndState({ refund: 'refunded' }, untouched))).toBe(false);
    expect(allPassed(gradeEndState({ refund: 'pending_approval' }, untouched))).toBe(false);
  });

  it('fails when the refund has the wrong status or there is an extra one', () => {
    expect(allPassed(gradeEndState({ refund: 'pending_approval' }, { ...untouched, refunds: ['refunded'] }))).toBe(false);
    expect(allPassed(gradeEndState({ refund: 'none' }, { ...untouched, refunds: ['refunded'] }))).toBe(false);
    expect(allPassed(gradeEndState({ refund: 'refunded' }, { ...untouched, refunds: ['refunded', 'refunded'] }))).toBe(false);
  });

  it('checks each subscription field separately', () => {
    const results = gradeEndState(
      { subscription: { planCode: 'standard_monthly', pendingPlanCode: 'basic_monthly' } },
      untouched,
    );
    expect(results.map((r) => r.passed)).toEqual([true, false]);
  });

  it('fails subscription checks for a customer without a subscription', () => {
    expect(allPassed(gradeEndState({ subscription: { cancelAtPeriodEnd: true } }, { ...untouched, subscription: null }))).toBe(false);
  });

  it('fails "no changes" when an action tool ran', () => {
    expect(allPassed(gradeEndState({ noChanges: true }, untouched))).toBe(true);
    expect(allPassed(gradeEndState({ noChanges: true }, { ...untouched, successfulWrites: ['cancel_subscription'] }))).toBe(false);
  });
});

describe('eval cases', () => {
  it('have unique ids and at least one check each', () => {
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    for (const c of CASES) {
      const checks = gradeEndState(c.expect, untouched).length + (c.expect.judge?.length ?? 0);
      expect(checks, c.id).toBeGreaterThan(0);
    }
  });

  it('cover both directions: cases that must act and cases that must not', () => {
    const mustAct = CASES.filter((c) => c.expect.refund === 'refunded' || c.expect.subscription);
    const mustNotAct = CASES.filter((c) => c.expect.noChanges || c.expect.refund === 'none');
    expect(mustAct.length).toBeGreaterThanOrEqual(4);
    expect(mustNotAct.length).toBeGreaterThanOrEqual(4);
  });
});

describe('renderForJudge', () => {
  it('marks an empty reply so the judge cannot read it as an answer', () => {
    const text = renderForJudge('The reply is in Portuguese.', { turns: [{ customer: 'Oi', agent: '' }], tools: [] });
    expect(text).toContain('(empty reply)');
    expect(text).toContain('(no tools were called)');
  });
});
