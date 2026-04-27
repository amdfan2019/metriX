import { CADENCE_WINDOWS, daysBetween } from "@/lib/recurring/cadence";
import type { AlertCandidate, AlertRecurringInput, AlertTxnInput } from "./types";

const LATENESS_GRACE_DAYS = 2;

const CRITICAL_DAYS = 7;
const WARN_DAYS = 5;

export interface DetectIncomeLatenessOptions {
  todayISO: string;
}

/**
 * Active income recurring series whose `next_expected_date` is more than 2
 * days in the past, AND no transaction has landed since `next_expected_date`
 * that matches the series amount within ±10%. Catches "paycheck didn't show
 * up" scenarios — common signal of a payroll glitch the user wants to know
 * about quickly.
 *
 * Severity scales with how late: 2-4 days info, 5-6 warn, 7+ critical.
 *
 * Resolution: when a matching txn arrives, the next scan won't re-detect (the
 * series's recurring scan refreshes next_expected_date forward) and the
 * existing alert gets auto-resolved by the scan's reconciliation pass.
 */
export function detectIncomeLateness(
  recurring: AlertRecurringInput[],
  txns: AlertTxnInput[],
  options: DetectIncomeLatenessOptions,
): AlertCandidate[] {
  const today = options.todayISO;
  const out: AlertCandidate[] = [];

  for (const series of recurring) {
    if (series.direction !== "income") continue;
    if (series.status !== "active") continue;
    if (series.ignored) continue;
    if (series.legCount < 2) continue; // need history to predict

    const expected = series.nextExpectedDate;
    if (expected >= today) continue;
    const lateDays = daysBetween(expected, today);
    if (lateDays <= LATENESS_GRACE_DAYS) continue;

    // Have we already seen a matching deposit since the expected date?
    const cadenceDays = CADENCE_WINDOWS[series.cadence].centerDays;
    const tolerance = 0.1 * series.typicalAmountCents;
    const matched = txns.some(
      (t) =>
        t.amountCents > 0 &&
        t.category === "income" &&
        t.transactionDate >= expected &&
        Math.abs(t.amountCents - series.typicalAmountCents) <= tolerance &&
        // crude merchant association: name contains a token from the series
        // name, or — fallback — amount and timing both match. Keep it loose
        // because Basiq sometimes returns inflows with mangled descriptions.
        (matchesByMerchant(t, series) || (lateDays <= cadenceDays && Math.abs(t.amountCents - series.typicalAmountCents) <= tolerance / 2)),
    );
    if (matched) continue;

    const severity =
      lateDays >= CRITICAL_DAYS ? "critical" : lateDays >= WARN_DAYS ? "warn" : "info";
    const fmtAmt = `$${(series.typicalAmountCents / 100).toFixed(2)}`;

    out.push({
      kind: "income_late",
      severity,
      title: `${series.merchantName} pay is ${lateDays} day${lateDays === 1 ? "" : "s"} late`,
      body: `Expected ${fmtAmt} on ${expected}; nothing matching has landed yet.`,
      dedupKey: `income_late:${series.id}:${expected}`,
      sourceRecurringId: series.id,
      metadata: {
        merchant_name: series.merchantName,
        cadence: series.cadence,
        expected_date: expected,
        days_late: lateDays,
        typical_amount_cents: series.typicalAmountCents,
      },
    });
  }

  return out;
}

function matchesByMerchant(t: AlertTxnInput, series: AlertRecurringInput): boolean {
  if (!t.merchantName) return false;
  const txMerchant = t.merchantName.toLowerCase();
  const seriesMerchant = series.merchantName.toLowerCase();
  if (txMerchant === seriesMerchant) return true;
  // Match the first significant token of the series name in the txn merchant.
  const firstToken = seriesMerchant.split(/\s+/).find((s) => s.length > 3);
  if (!firstToken) return false;
  return txMerchant.includes(firstToken);
}
