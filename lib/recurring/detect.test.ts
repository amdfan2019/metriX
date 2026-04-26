import { describe, expect, it } from "vitest";
import { detectRecurringSeries, type DetectInput } from "./detect";

const t = (overrides: Partial<DetectInput>): DetectInput => ({
  id: "t1",
  merchantName: "NETFLIX.COM",
  category: "entertainment",
  amountCents: -2399,
  transactionDate: "2026-04-01",
  isTransfer: false,
  pending: false,
  ...overrides,
});

describe("detectRecurringSeries", () => {
  it("detects a clean monthly subscription with 3 legs", () => {
    const series = detectRecurringSeries([
      t({ id: "n1", transactionDate: "2026-02-01" }),
      t({ id: "n2", transactionDate: "2026-03-01" }),
      t({ id: "n3", transactionDate: "2026-04-01" }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].cadence).toBe("monthly");
    expect(series[0].legCount).toBe(3);
    expect(series[0].typicalAmountCents).toBe(2399);
    expect(series[0].minAmountCents).toBe(2399);
    expect(series[0].maxAmountCents).toBe(2399);
    expect(series[0].firstSeenDate).toBe("2026-02-01");
    expect(series[0].lastSeenDate).toBe("2026-04-01");
    // monthly center = 30 days → 2026-04-01 + 30 = 2026-05-01
    expect(series[0].nextExpectedDate).toBe("2026-05-01");
    expect(series[0].confidence).toBeGreaterThan(0.7);
  });

  it("detects a fortnightly series with 7 legs", () => {
    const dates = ["2026-01-05", "2026-01-19", "2026-02-02", "2026-02-16", "2026-03-02", "2026-03-16", "2026-03-30"];
    const series = detectRecurringSeries(
      dates.map((d, i) => t({ id: `f${i}`, transactionDate: d, merchantName: "OPAL" })),
    );
    expect(series).toHaveLength(1);
    expect(series[0].cadence).toBe("fortnightly");
    expect(series[0].legCount).toBe(7);
    expect(series[0].confidence).toBeGreaterThan(0.85);
  });

  it("does not detect a one-off transaction", () => {
    const series = detectRecurringSeries([t({ id: "lone" })]);
    expect(series).toEqual([]);
  });

  it("detects a 2-leg series with lower confidence", () => {
    const series = detectRecurringSeries([
      t({ id: "n1", transactionDate: "2026-03-01" }),
      t({ id: "n2", transactionDate: "2026-04-01" }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].legCount).toBe(2);
    expect(series[0].confidence).toBeLessThan(0.7);
  });

  it("absorbs date jitter (28-, 29-, 31-day months)", () => {
    const series = detectRecurringSeries([
      t({ id: "j1", transactionDate: "2026-01-15" }),
      t({ id: "j2", transactionDate: "2026-02-13" }),
      t({ id: "j3", transactionDate: "2026-03-16" }),
      t({ id: "j4", transactionDate: "2026-04-15" }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].cadence).toBe("monthly");
    expect(series[0].legCount).toBe(4);
  });

  it("captures amount variance for utility bills (low confidence, but detected)", () => {
    const series = detectRecurringSeries([
      t({ id: "u1", transactionDate: "2026-01-15", amountCents: -18000, merchantName: "AGL ENERGY", category: "utilities" }),
      t({ id: "u2", transactionDate: "2026-02-15", amountCents: -22000, merchantName: "AGL ENERGY", category: "utilities" }),
      t({ id: "u3", transactionDate: "2026-03-15", amountCents: -19500, merchantName: "AGL ENERGY", category: "utilities" }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].cadence).toBe("monthly");
    expect(series[0].minAmountCents).toBe(18000);
    expect(series[0].maxAmountCents).toBe(22000);
    expect(series[0].typicalAmountCents).toBe(19500); // median of 18000/19500/22000
  });

  it("excludes transfers", () => {
    const series = detectRecurringSeries([
      t({ id: "x1", transactionDate: "2026-02-01", isTransfer: true, category: "transfer" }),
      t({ id: "x2", transactionDate: "2026-03-01", isTransfer: true, category: "transfer" }),
      t({ id: "x3", transactionDate: "2026-04-01", isTransfer: true, category: "transfer" }),
    ]);
    expect(series).toEqual([]);
  });

  it("excludes income (positive amounts)", () => {
    const series = detectRecurringSeries([
      t({ id: "i1", transactionDate: "2026-02-01", amountCents: 450000, category: "income", merchantName: "ACME PTY LTD" }),
      t({ id: "i2", transactionDate: "2026-03-01", amountCents: 450000, category: "income", merchantName: "ACME PTY LTD" }),
      t({ id: "i3", transactionDate: "2026-04-01", amountCents: 450000, category: "income", merchantName: "ACME PTY LTD" }),
    ]);
    expect(series).toEqual([]);
  });

  it("excludes uncategorised transactions", () => {
    const series = detectRecurringSeries([
      t({ id: "u1", transactionDate: "2026-02-01", category: null }),
      t({ id: "u2", transactionDate: "2026-03-01", category: null }),
    ]);
    expect(series).toEqual([]);
  });

  it("excludes pending transactions", () => {
    const series = detectRecurringSeries([
      t({ id: "p1", transactionDate: "2026-02-01", pending: true }),
      t({ id: "p2", transactionDate: "2026-03-01", pending: true }),
    ]);
    expect(series).toEqual([]);
  });

  it("separates two merchants with the same cadence", () => {
    const series = detectRecurringSeries([
      t({ id: "n1", transactionDate: "2026-02-01", merchantName: "NETFLIX.COM" }),
      t({ id: "n2", transactionDate: "2026-03-01", merchantName: "NETFLIX.COM" }),
      t({ id: "s1", transactionDate: "2026-02-08", merchantName: "SPOTIFY", amountCents: -1399 }),
      t({ id: "s2", transactionDate: "2026-03-08", merchantName: "SPOTIFY", amountCents: -1399 }),
    ]);
    expect(series).toHaveLength(2);
    const merchants = series.map((s) => s.merchantName).sort();
    expect(merchants).toEqual(["NETFLIX.COM", "SPOTIFY"]);
  });

  it("prefers yearly over monthly when both could fit (longer cadence wins on tie)", () => {
    // Two legs ~365 days apart — could be a degenerate "monthly" (gap > maxDays of monthly)
    // but cleanly fits yearly. Yearly wins.
    const series = detectRecurringSeries([
      t({ id: "y1", transactionDate: "2025-04-01", merchantName: "DOMAIN RENEWAL" }),
      t({ id: "y2", transactionDate: "2026-04-01", merchantName: "DOMAIN RENEWAL" }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].cadence).toBe("yearly");
  });

  it("does not chain through a long gap (>= 2 cadences missed)", () => {
    // Three legs, but middle gap is too big to be one missed monthly leg.
    const series = detectRecurringSeries([
      t({ id: "g1", transactionDate: "2026-01-01" }),
      t({ id: "g2", transactionDate: "2026-02-01" }),
      // big gap — > 2 * 34 days = 68 days
      t({ id: "g3", transactionDate: "2026-04-25" }),
    ]);
    expect(series).toHaveLength(1);
    // The chain should be the first two only — third leg is too far.
    expect(series[0].legCount).toBe(2);
    expect(series[0].lastSeenDate).toBe("2026-02-01");
  });

  it("rejects high-density vendors where some visits happen to align (KFC-style)", () => {
    // 8 KFC visits over ~60 days at random intervals. The detector's chain
    // finder will find a 3-leg "monthly" alignment among these by coincidence,
    // but the density check should kill it.
    const visits = [
      "2026-02-03", "2026-02-08", "2026-02-15", "2026-02-22",
      "2026-03-04", "2026-03-12", "2026-03-25",
      "2026-04-04",
    ];
    const series = detectRecurringSeries(
      visits.map((d, i) => t({ id: `kfc${i}`, transactionDate: d, merchantName: "KFC", category: "dining", amountCents: -1500 - i * 200 })),
    );
    expect(series).toEqual([]);
  });

  it("rejects 2-leg chain in non-recurring category with non-identical amounts", () => {
    // Dining at the same restaurant 30 days apart with $30 vs $42. Real
    // subscriptions stay within a few cents — this is just two dinners.
    const series = detectRecurringSeries([
      t({ id: "d1", transactionDate: "2026-03-12", merchantName: "REUBEN HILLS", category: "dining", amountCents: -3000 }),
      t({ id: "d2", transactionDate: "2026-04-12", merchantName: "REUBEN HILLS", category: "dining", amountCents: -4200 }),
    ]);
    expect(series).toEqual([]);
  });

  it("accepts a 2-leg dining chain when the amount is essentially identical", () => {
    // The amount-tightness exception: even in a non-recurring category, two
    // legs at the exact same dollar figure 30 days apart probably IS a
    // recurring habit (e.g. a fixed-price weekly meal plan).
    const series = detectRecurringSeries([
      t({ id: "d1", transactionDate: "2026-03-12", merchantName: "BRUNCH CLUB", category: "dining", amountCents: -2500 }),
      t({ id: "d2", transactionDate: "2026-04-12", merchantName: "BRUNCH CLUB", category: "dining", amountCents: -2500 }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].cadence).toBe("monthly");
  });

  it("accepts a 2-leg utility chain even with notable amount swing", () => {
    // Utilities are recurring-friendly so we tolerate a wider amount range
    // (CV up to 30%) on a 2-leg chain.
    const series = detectRecurringSeries([
      t({ id: "u1", transactionDate: "2026-02-15", merchantName: "AGL ENERGY", category: "utilities", amountCents: -18000 }),
      t({ id: "u2", transactionDate: "2026-03-15", merchantName: "AGL ENERGY", category: "utilities", amountCents: -22000 }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].minAmountCents).toBe(18000);
    expect(series[0].maxAmountCents).toBe(22000);
  });

  it("rejects a chain whose legs land on wildly different days of the month", () => {
    // Two transactions exactly 30 days apart but one is on the 5th and the
    // other on the 12th — same gap, but no real subscription drifts that
    // much in calendar position.
    const series = detectRecurringSeries([
      t({ id: "x1", transactionDate: "2026-02-05", merchantName: "MR WONG", category: "dining", amountCents: -6000 }),
      t({ id: "x2", transactionDate: "2026-03-12", merchantName: "MR WONG", category: "dining", amountCents: -6000 }),
    ]);
    expect(series).toEqual([]);
  });

  it("accepts month-end subscriptions despite Feb shifting to the 28th", () => {
    // A subscription billed on the 31st each month lands on the 28th in
    // February — that's a 3-day shift on the day-of-month, just inside our
    // ±3 tolerance.
    const series = detectRecurringSeries([
      t({ id: "m1", transactionDate: "2026-01-31" }),
      t({ id: "m2", transactionDate: "2026-02-28" }),
      t({ id: "m3", transactionDate: "2026-03-31" }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].cadence).toBe("monthly");
    expect(series[0].legCount).toBe(3);
    expect(series[0].direction).toBe("expense");
  });

  describe("income direction", () => {
    const inflow = (overrides: Partial<DetectInput>): DetectInput => ({
      id: "p1",
      merchantName: "ACME PAYROLL",
      category: "income",
      amountCents: 450000, // $4500 inflow
      transactionDate: "2026-04-15",
      isTransfer: false,
      pending: false,
      ...overrides,
    });

    it("detects a fortnightly paycheck", () => {
      const series = detectRecurringSeries(
        [
          inflow({ id: "p1", transactionDate: "2026-02-06" }),
          inflow({ id: "p2", transactionDate: "2026-02-20" }),
          inflow({ id: "p3", transactionDate: "2026-03-06" }),
          inflow({ id: "p4", transactionDate: "2026-03-20" }),
          inflow({ id: "p5", transactionDate: "2026-04-03" }),
        ],
        { direction: "income" },
      );
      expect(series).toHaveLength(1);
      expect(series[0].direction).toBe("income");
      expect(series[0].cadence).toBe("fortnightly");
      expect(series[0].legCount).toBe(5);
      expect(series[0].typicalAmountCents).toBe(450000);
    });

    it("detects a monthly paycheck on the 15th", () => {
      const series = detectRecurringSeries(
        [
          inflow({ id: "m1", transactionDate: "2026-01-15", amountCents: 600000 }),
          inflow({ id: "m2", transactionDate: "2026-02-13", amountCents: 600000 }), // shifted to Friday
          inflow({ id: "m3", transactionDate: "2026-03-15", amountCents: 600000 }),
        ],
        { direction: "income" },
      );
      expect(series).toHaveLength(1);
      expect(series[0].direction).toBe("income");
      expect(series[0].cadence).toBe("monthly");
    });

    it("expense pass ignores income transactions even when they form a series", () => {
      const series = detectRecurringSeries([
        inflow({ id: "p1", transactionDate: "2026-02-06" }),
        inflow({ id: "p2", transactionDate: "2026-02-20" }),
        inflow({ id: "p3", transactionDate: "2026-03-06" }),
      ]);
      expect(series).toEqual([]);
    });

    it("income pass ignores outflow transactions", () => {
      const series = detectRecurringSeries(
        [
          // Same merchant + cadence as Netflix, but spend not income.
          t({ id: "n1", transactionDate: "2026-02-01", merchantName: "NETFLIX" }),
          t({ id: "n2", transactionDate: "2026-03-01", merchantName: "NETFLIX" }),
          t({ id: "n3", transactionDate: "2026-04-01", merchantName: "NETFLIX" }),
        ],
        { direction: "income" },
      );
      expect(series).toEqual([]);
    });

    it("income pass ignores positive amounts that aren't categorised as income", () => {
      // A $50 refund tagged 'shopping' isn't a recurring income.
      const series = detectRecurringSeries(
        [
          inflow({ id: "r1", transactionDate: "2026-03-01", category: "shopping", amountCents: 5000 }),
          inflow({ id: "r2", transactionDate: "2026-04-01", category: "shopping", amountCents: 5000 }),
        ],
        { direction: "income" },
      );
      expect(series).toEqual([]);
    });

    it("rejects a one-off gift even when amounts match a recurring shape", () => {
      const series = detectRecurringSeries(
        [
          inflow({ id: "g1", transactionDate: "2026-04-15", merchantName: "MOM TRANSFER", amountCents: 50000 }),
        ],
        { direction: "income" },
      );
      expect(series).toEqual([]);
    });
  });
});
