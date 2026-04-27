import type { AlertCandidate, AlertRecurringInput, AlertTxnInput } from "./types";

/** Percentage difference from typical that triggers a price-change alert. */
const PRICE_CHANGE_THRESHOLD_PCT = 0.15; // 15%

/**
 * Severity by absolute dollar change — a 20% bump on a $5 charge isn't worth
 * waking the user, but the same 20% on $200 is.
 */
const CRITICAL_DELTA_CENTS = 5000;
const WARN_DELTA_CENTS = 1500;

export interface DetectPriceChangesOptions {
  todayISO: string;
  /** How recent the leg has to be to count as "fresh" — older changes are baseline. */
  windowDays?: number;
}

/**
 * Looks for the most recent leg of each known recurring series and compares
 * its amount to the series' typical. >15% drift → flag.
 *
 * Skips inactive / ignored series. Skips manual series (they have no "typical"
 * derived from data; the user set the amount themselves). Skips income — a
 * pay rise isn't really an alert in the same sense; we'll surface that
 * differently in the income-drift work.
 *
 * Important: reads from the *transactions* feed, not the recurring row's
 * derived stats — the recurring row's typical_amount_cents already smooths
 * the new leg in. We want the raw most-recent leg amount.
 */
export function detectRecurringPriceChanges(
  recurring: AlertRecurringInput[],
  txns: AlertTxnInput[],
  options: DetectPriceChangesOptions,
): AlertCandidate[] {
  const windowDays = options.windowDays ?? 14;
  const sinceISO = addDaysISO(options.todayISO, -windowDays);

  // Build last-leg-by-series from the transactions feed.
  const lastLegBySeries = new Map<string, AlertTxnInput>();
  for (const t of txns) {
    if (!t.recurringExpenseId) continue;
    if (t.pending) continue;
    const existing = lastLegBySeries.get(t.recurringExpenseId);
    if (!existing || t.transactionDate > existing.transactionDate) {
      lastLegBySeries.set(t.recurringExpenseId, t);
    }
  }

  const out: AlertCandidate[] = [];
  for (const series of recurring) {
    if (series.status !== "active") continue;
    if (series.ignored) continue;
    if (series.direction !== "expense") continue;
    if (series.typicalAmountCents <= 0) continue;

    const leg = lastLegBySeries.get(series.id);
    if (!leg) continue;
    if (leg.transactionDate < sinceISO) continue;

    const newAmount = Math.abs(leg.amountCents);
    const oldAmount = series.typicalAmountCents;
    const delta = Math.abs(newAmount - oldAmount);
    const pct = delta / oldAmount;
    if (pct < PRICE_CHANGE_THRESHOLD_PCT) continue;
    // Sanity floor: skip swings under $2 even if they exceed 15% (noise on
    // tiny charges like Google $4.49 → $5.49 that's just rounding-class).
    if (delta < 200) continue;

    const direction = newAmount > oldAmount ? "increase" : "decrease";
    const severity =
      delta >= CRITICAL_DELTA_CENTS ? "critical" : delta >= WARN_DELTA_CENTS ? "warn" : "info";
    const fmtNew = `$${(newAmount / 100).toFixed(2)}`;
    const fmtOld = `$${(oldAmount / 100).toFixed(2)}`;

    out.push({
      kind: "price_change",
      severity,
      title: `${series.merchantName} ${direction} — ${fmtOld} → ${fmtNew}`,
      body: `Latest charge ${fmtNew} on ${leg.transactionDate}; typical is ${fmtOld} (${Math.round(pct * 100)}% ${direction}).`,
      dedupKey: `price_change:${series.id}:${newAmount}`,
      sourceRecurringId: series.id,
      sourceTransactionId: leg.id,
      metadata: {
        merchant_name: series.merchantName,
        category: series.category,
        cadence: series.cadence,
        old_amount_cents: oldAmount,
        new_amount_cents: newAmount,
        delta_cents: delta,
        change_pct: Number(pct.toFixed(3)),
        leg_date: leg.transactionDate,
      },
    });
  }

  return out;
}

function addDaysISO(iso: string, days: number): string {
  const ms =
    Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) +
    days * 86400000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
