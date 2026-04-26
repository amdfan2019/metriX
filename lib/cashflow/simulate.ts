import type { Cadence } from "@/lib/db/schema";
import { addDays, daysBetween } from "@/lib/recurring/cadence";

/**
 * Cashflow simulator — pure function. Walks the user's projected balance
 * forward day-by-day using:
 *   - a starting balance
 *   - detected/manual recurring streams (income + expenses) with cadence and
 *     last-seen / next-expected anchors
 *   - a flat "variable spend per day" rate computed from recent non-recurring
 *     outflows (median + MAD baseline; see baselineVariableSpend below)
 *
 * Output is one row per simulated day. Each row carries the projected balance
 * at end-of-day and any events that hit that day so the UI can label the
 * trigger when balance dips below the buffer.
 *
 * Decoupled from DB so the algorithm can be unit-tested. The query layer
 * (lib/cashflow/queries.ts) reads the right rows and feeds them in.
 */

const CADENCE_CENTER_DAYS: Record<Cadence, number> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
  yearly: 365,
};

export interface RecurringStreamInput {
  id: string;
  merchantName: string;
  cadence: Cadence;
  /** Magnitude. Always positive. Direction tells us the sign. */
  typicalAmountCents: number;
  /** First date this stream is expected to land. Future dates only — past dates
   *  are treated as "today" so the simulator doesn't replay history. */
  nextExpectedDate: string;
  direction: "expense" | "income";
}

export interface ForecastEvent {
  type: "recurring-income" | "recurring-expense" | "variable-spend";
  /** Positive cents. The simulator applies sign based on type. */
  amountCents: number;
  label: string;
  /** Set when the event came from a known recurring stream. */
  streamId?: string;
}

export interface ForecastDay {
  date: string; // YYYY-MM-DD
  /** End-of-day projected balance. Can go negative — that's the whole point. */
  projectedBalanceCents: number;
  events: ForecastEvent[];
}

export interface SimulateInput {
  startBalanceCents: number;
  startDate: string; // YYYY-MM-DD — usually "today"
  /** Active streams. Inactive/ignored should be filtered before passing in. */
  streams: RecurringStreamInput[];
  /** Per-day non-recurring spend baseline (positive cents). */
  variableSpendCentsPerDay: number;
  /** How many days to project forward, inclusive. 60 is the dashboard default. */
  days: number;
}

/**
 * Walk forward day by day. Each cycle:
 *   1. Apply any recurring streams scheduled for the day.
 *   2. Apply the flat variable-spend rate as a daily outflow.
 *   3. Record the end-of-day balance and the events.
 *
 * Recurring streams compound: after a stream fires on `nextExpected`, we
 * advance its anchor by its cadence interval and check whether the next
 * occurrence still falls inside the window.
 */
export function simulateCashflow(input: SimulateInput): ForecastDay[] {
  const { startBalanceCents, startDate, streams, variableSpendCentsPerDay, days } = input;

  // Build a working copy of stream cursors; we advance these as events fire.
  const cursors = streams
    .filter((s) => s.typicalAmountCents > 0)
    .map((s) => ({
      stream: s,
      // Treat any past `nextExpectedDate` as today — we don't backfill history.
      nextDate: s.nextExpectedDate < startDate ? startDate : s.nextExpectedDate,
    }));

  const out: ForecastDay[] = [];
  let balance = startBalanceCents;

  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i);
    const events: ForecastEvent[] = [];

    // 1. Recurring streams for today. Loop in case a stream's cadence is so
    // tight (weekly) and nextDate has slipped that two events fall on the same
    // day — rare in practice but defensive.
    for (const c of cursors) {
      while (c.nextDate === date) {
        const sign = c.stream.direction === "income" ? 1 : -1;
        balance += sign * c.stream.typicalAmountCents;
        events.push({
          type: c.stream.direction === "income" ? "recurring-income" : "recurring-expense",
          amountCents: c.stream.typicalAmountCents,
          label: c.stream.merchantName,
          streamId: c.stream.id,
        });
        c.nextDate = addDays(c.nextDate, CADENCE_CENTER_DAYS[c.stream.cadence]);
      }
    }

    // 2. Variable spend baseline — debited every day.
    if (variableSpendCentsPerDay > 0) {
      balance -= variableSpendCentsPerDay;
      events.push({
        type: "variable-spend",
        amountCents: variableSpendCentsPerDay,
        label: "Daily spend baseline",
      });
    }

    out.push({ date, projectedBalanceCents: balance, events });
  }

  return out;
}

export interface RiskDay {
  date: string;
  projectedBalanceCents: number;
  bufferCents: number;
  /** Most consequential outflow event that day, or "below buffer carry-forward" if no event landed. */
  triggerLabel: string;
  triggerType: ForecastEvent["type"] | "carry-forward";
}

/**
 * Returns days where the projected balance dropped below the buffer.
 *
 * "Trigger" picks the largest outflow event on that day if any, otherwise
 * 'carry-forward' (steady variable spend brought us under). This gives the UI
 * something concrete to display ("AGL bill on the 12th") instead of a generic
 * warning.
 */
export function findRiskDays(forecast: ForecastDay[], bufferCents: number): RiskDay[] {
  const risks: RiskDay[] = [];
  for (const day of forecast) {
    if (day.projectedBalanceCents >= bufferCents) continue;

    // Pick the largest outflow event today — that's almost always the
    // trigger. If only variable-spend hit, label it carry-forward.
    const outflows = day.events.filter(
      (e) => e.type === "recurring-expense" || e.type === "variable-spend",
    );
    let trigger: ForecastEvent | null = null;
    for (const e of outflows) {
      if (e.type === "variable-spend") continue;
      if (!trigger || e.amountCents > trigger.amountCents) trigger = e;
    }
    risks.push({
      date: day.date,
      projectedBalanceCents: day.projectedBalanceCents,
      bufferCents,
      triggerLabel: trigger ? trigger.label : "Daily spend depletion",
      triggerType: trigger ? trigger.type : "carry-forward",
    });
  }
  return risks;
}

/**
 * Variable-spend baseline computed from a list of "non-recurring outflow"
 * transaction amounts (positive cents per transaction). We use the median of
 * the per-day totals over the lookback window — robust to one-off spikes
 * (e.g. an annual purchase) that a mean would let dominate the projection.
 *
 * Returns 0 if the window has no data; caller can default to a placeholder
 * (e.g. zero or a sensible per-category fallback).
 */
export function baselineVariableSpend(
  perDayTotalsCents: number[],
): number {
  if (perDayTotalsCents.length === 0) return 0;
  const sorted = [...perDayTotalsCents].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? sorted[mid]
      : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return median;
}

/**
 * Re-export the cadence helper so callers in queries.ts can derive the next
 * expected date from a recurring row's last_seen + cadence.
 */
export { addDays, daysBetween };
