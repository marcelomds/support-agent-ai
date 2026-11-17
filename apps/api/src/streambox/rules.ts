/**
 * StreamBox business rules, in one place.
 * The prompt describes these to the agent; this code is what enforces them.
 */
export const REFUND_WINDOW_DAYS = 7;
/** Refunds above this amount are not executed by the agent. */
export const REFUND_APPROVAL_THRESHOLD_CENTS = 5000;
/** Two successful charges this close together count as a duplicate. */
export const DUPLICATE_CHARGE_WINDOW_HOURS = 24;

export const DAY_MS = 24 * 60 * 60 * 1000;
export const PERIOD_DAYS = { monthly: 30, yearly: 365 } as const;
export const TIER_RANK = { basic: 1, standard: 2, premium: 3 } as const;

export const formatUsd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Injectable clock so tests and evals can pin "now". */
export abstract class Clock {
  abstract now(): Date;
}
export class SystemClock extends Clock {
  now() {
    return new Date();
  }
}
