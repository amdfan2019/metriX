import { describe, expect, it } from "vitest";
import { detectTransactionAnomalies } from "./transaction-anomalies";
import type { AlertTxnInput } from "./types";

const t = (overrides: Partial<AlertTxnInput>): AlertTxnInput => ({
  id: "t1",
  transactionDate: "2026-04-25",
  description: "TOBYS ESTATE",
  merchantName: "Toby's Estate",
  category: "dining",
  amountCents: -2200,
  isTransfer: false,
  pending: false,
  recurringExpenseId: null,
  ...overrides,
});

describe("detectTransactionAnomalies", () => {
  it("returns nothing when a (category, merchant) pair has fewer than 5 samples", () => {
    const txns = [
      t({ id: "1", amountCents: -2000 }),
      t({ id: "2", amountCents: -2100 }),
      t({ id: "3", amountCents: -2300 }),
      t({ id: "4", amountCents: -90000 }), // would-be anomaly but too few samples
    ];
    expect(detectTransactionAnomalies(txns, { todayISO: "2026-04-26" })).toEqual([]);
  });

  it("flags a transaction more than 3 × MAD above the median", () => {
    // 5 small charges around $20-25, then a $200 outlier.
    const txns = [
      t({ id: "1", amountCents: -2000, transactionDate: "2026-04-01" }),
      t({ id: "2", amountCents: -2200, transactionDate: "2026-04-05" }),
      t({ id: "3", amountCents: -2400, transactionDate: "2026-04-10" }),
      t({ id: "4", amountCents: -2300, transactionDate: "2026-04-15" }),
      t({ id: "5", amountCents: -2100, transactionDate: "2026-04-20" }),
      t({ id: "outlier", amountCents: -20000, transactionDate: "2026-04-25" }),
    ];
    const r = detectTransactionAnomalies(txns, { todayISO: "2026-04-26" });
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe("transaction_anomaly");
    expect(r[0].sourceTransactionId).toBe("outlier");
    expect(r[0].dedupKey).toBe("txn_anomaly:outlier");
  });

  it("doesn't flag charges below the historical median", () => {
    const txns = [
      t({ id: "1", amountCents: -5000 }),
      t({ id: "2", amountCents: -5100 }),
      t({ id: "3", amountCents: -4900 }),
      t({ id: "4", amountCents: -5200 }),
      t({ id: "5", amountCents: -4800 }),
      t({ id: "low", amountCents: -1000, transactionDate: "2026-04-25" }),
    ];
    expect(detectTransactionAnomalies(txns, { todayISO: "2026-04-26" })).toEqual([]);
  });

  it("only flags transactions within the look-back window (default 7 days)", () => {
    const txns = [
      t({ id: "1", amountCents: -2000, transactionDate: "2026-04-01" }),
      t({ id: "2", amountCents: -2100, transactionDate: "2026-04-05" }),
      t({ id: "3", amountCents: -1900, transactionDate: "2026-04-10" }),
      t({ id: "4", amountCents: -2050, transactionDate: "2026-04-12" }),
      t({ id: "5", amountCents: -2000, transactionDate: "2026-04-14" }),
      // outlier > 7 days ago
      t({ id: "old-outlier", amountCents: -50000, transactionDate: "2026-04-15" }),
    ];
    expect(detectTransactionAnomalies(txns, { todayISO: "2026-04-26" })).toEqual([]);
  });

  it("escalates severity by deviation magnitude", () => {
    // Baseline has small variance so MAD > 0; median ≈ $30.
    const baseline = [
      t({ id: "b1", amountCents: -2800 }),
      t({ id: "b2", amountCents: -2900 }),
      t({ id: "b3", amountCents: -3000 }),
      t({ id: "b4", amountCents: -3100 }),
      t({ id: "b5", amountCents: -3200 }),
      t({ id: "b6", amountCents: -2950 }),
    ];
    const small = t({ id: "small-out", amountCents: -8500, transactionDate: "2026-04-25" }); // +$55 → warn
    const big = t({ id: "big-out", amountCents: -25000, transactionDate: "2026-04-25" }); // +$220 → critical
    const r = detectTransactionAnomalies([...baseline, small, big], { todayISO: "2026-04-26" });
    const bySource = Object.fromEntries(r.map((a) => [a.sourceTransactionId, a]));
    expect(bySource["small-out"]?.severity).toBe("warn");
    expect(bySource["big-out"]?.severity).toBe("critical");
  });

  it("ignores transfers, pending, income, and refunds", () => {
    const baseline = Array.from({ length: 6 }, (_, i) =>
      t({ id: `b${i}`, amountCents: -3000 }),
    );
    const txns: AlertTxnInput[] = [
      ...baseline,
      t({ id: "transfer", amountCents: -50000, isTransfer: true, transactionDate: "2026-04-25" }),
      t({ id: "pending", amountCents: -50000, pending: true, transactionDate: "2026-04-25" }),
      t({ id: "refund", amountCents: 50000, transactionDate: "2026-04-25" }),
      t({ id: "income", amountCents: 50000, category: "income", transactionDate: "2026-04-25" }),
    ];
    expect(detectTransactionAnomalies(txns, { todayISO: "2026-04-26" })).toEqual([]);
  });

  it("groups by (category, merchant) — same merchant in different categories doesn't pollute baselines", () => {
    const txns: AlertTxnInput[] = [
      // Apple in subscriptions ... wait, subscriptions is gone. Use 'other' / 'entertainment'.
      ...Array.from({ length: 5 }, (_, i) =>
        t({ id: `a${i}`, merchantName: "Apple", category: "other", amountCents: -1500 }),
      ),
      // Apple in entertainment — only 4 samples, shouldn't affect baseline
      t({ id: "a-ent", merchantName: "Apple", category: "entertainment", amountCents: -50000, transactionDate: "2026-04-25" }),
    ];
    const r = detectTransactionAnomalies(txns, { todayISO: "2026-04-26" });
    // a-ent is in a (entertainment, Apple) pair with only 1 sample — skipped.
    expect(r).toEqual([]);
  });
});
