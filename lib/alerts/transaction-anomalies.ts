import { addDays } from "@/lib/recurring/cadence";
import type { AlertCandidate, AlertTxnInput } from "./types";

/** Min historical samples required before we'll judge a (category, merchant) baseline. */
const MIN_SAMPLES = 5;

/**
 * Threshold in MAD-multiples. Robust statistics rule of thumb: ≥3 means well
 * outside the spread, even with skewed distributions. Lower → more chatter,
 * higher → silent.
 */
const MAD_THRESHOLD = 3;

/**
 * Look-back window: only flag transactions posted within this many days. Older
 * anomalies are baked into the baseline.
 */
const FLAG_WINDOW_DAYS = 7;

/**
 * Severity thresholds — driven by absolute over-baseline dollar amount, since
 * "5× MAD" of a $4 cafe is a $20 outlier (yawn) but "3× MAD" of a $200 utility
 * is a $600 outlier (matters).
 */
const CRITICAL_OVER_CENTS = 20000; // ≥ $200 over expected
const WARN_OVER_CENTS = 5000; // ≥ $50 over expected

export interface DetectAnomaliesOptions {
  /** Today (Sydney). Anomalies flagged for txns within `windowDays` of today. */
  todayISO: string;
  windowDays?: number;
}

/**
 * Per (category, merchant) rolling baseline. For each pair with ≥5 samples,
 * compute median + MAD. Flag any transaction in the window where:
 *   abs(amount) − median ≥ MAD_THRESHOLD × MAD
 *
 * Filters: outflows only (amount < 0), not transfers, not pending, has a
 * merchant_name and category, not income / transfer category. Refunds
 * (amount ≥ 0) and pending charges aren't anomalies — pending has its own
 * dedicated detector.
 *
 * "Lower than usual" is intentionally NOT flagged — saving $20 at Woolies
 * isn't a problem worth surfacing.
 */
export function detectTransactionAnomalies(
  txns: AlertTxnInput[],
  options: DetectAnomaliesOptions,
): AlertCandidate[] {
  const windowDays = options.windowDays ?? FLAG_WINDOW_DAYS;
  const since = addDays(options.todayISO, -windowDays);

  const candidates = txns.filter((t) => {
    if (t.amountCents >= 0) return false;
    if (t.isTransfer) return false;
    if (t.pending) return false;
    if (!t.merchantName || !t.category) return false;
    if (t.category === "income" || t.category === "transfer") return false;
    return true;
  });

  // Group by (category, merchant)
  const groups = new Map<string, AlertTxnInput[]>();
  for (const t of candidates) {
    const key = `${t.category}::${t.merchantName}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const out: AlertCandidate[] = [];
  for (const group of groups.values()) {
    if (group.length < MIN_SAMPLES) continue;

    const amounts = group.map((t) => Math.abs(t.amountCents));
    const median = computeMedian(amounts);
    const mad = computeMAD(amounts, median);
    if (mad === 0) continue; // identical historical amounts → no spread to flag against

    for (const t of group) {
      if (t.transactionDate < since) continue;
      const amt = Math.abs(t.amountCents);
      const deviation = amt - median;
      if (deviation <= 0) continue;
      const ratio = deviation / mad;
      if (ratio < MAD_THRESHOLD) continue;

      const severity =
        deviation >= CRITICAL_OVER_CENTS ? "critical" : deviation >= WARN_OVER_CENTS ? "warn" : "info";

      const fmtAmt = `$${(amt / 100).toFixed(2)}`;
      const fmtMedian = `$${(median / 100).toFixed(2)}`;
      out.push({
        kind: "transaction_anomaly",
        severity,
        title: `Unusual ${t.category} charge at ${t.merchantName}`,
        body: `${fmtAmt} on ${t.transactionDate} — your ${t.merchantName} charges usually run around ${fmtMedian}.`,
        dedupKey: `txn_anomaly:${t.id}`,
        sourceTransactionId: t.id,
        metadata: {
          category: t.category,
          merchant_name: t.merchantName,
          amount_cents: amt,
          median_cents: median,
          mad_cents: mad,
          mad_ratio: Number(ratio.toFixed(2)),
          deviation_cents: deviation,
          transaction_date: t.transactionDate,
        },
      });
    }
  }

  return out;
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n % 2 === 1) return sorted[(n - 1) / 2];
  return Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2);
}

function computeMAD(values: number[], median: number): number {
  return computeMedian(values.map((v) => Math.abs(v - median)));
}
