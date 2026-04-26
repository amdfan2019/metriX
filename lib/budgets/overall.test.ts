import { describe, expect, it } from "vitest";
import { computeOverallHealth } from "./overall";
import type { CalcTransaction } from "./calc";

const t = (overrides: Partial<CalcTransaction>): CalcTransaction => ({
  category: "groceries",
  amountCents: -1000,
  transactionDate: "2026-04-15",
  ...overrides,
});

describe("computeOverallHealth", () => {
  it("returns income-unset when income is null", () => {
    const h = computeOverallHealth({
      monthlyIncomeCents: null,
      monthTransactions: [t({ amountCents: -2500 })],
      committedRemaining: {},
      todayISO: "2026-04-15",
    });
    expect(h.status).toBe("income-unset");
    expect(h.spentCents).toBe(2500);
    expect(h.flexibleRemainingCents).toBe(0);
  });

  it("returns on-track when flexible remaining is comfortably above 15% of income", () => {
    const h = computeOverallHealth({
      monthlyIncomeCents: 500000, // $5000
      monthTransactions: [
        t({ category: "groceries", amountCents: -50000 }),
        t({ category: "dining", amountCents: -30000 }),
      ],
      committedRemaining: { utilities: 20000 }, // $200 utility upcoming
      todayISO: "2026-04-15",
    });
    expect(h.spentCents).toBe(80000);
    expect(h.committedCents).toBe(20000);
    expect(h.flexibleRemainingCents).toBe(400000);
    expect(h.status).toBe("on-track");
    expect(h.daysRemaining).toBe(16); // 30 - 15 + 1
  });

  it("returns tight when flexible remaining is positive but under 15% of income", () => {
    const h = computeOverallHealth({
      monthlyIncomeCents: 500000,
      monthTransactions: [t({ category: "rent", amountCents: -250000 })],
      committedRemaining: { rent: 200000 },
      todayISO: "2026-04-15",
    });
    expect(h.flexibleRemainingCents).toBe(50000);
    expect(h.status).toBe("tight"); // 10% of income
  });

  it("returns over when flexible remaining is zero or negative", () => {
    const h = computeOverallHealth({
      monthlyIncomeCents: 500000,
      monthTransactions: [t({ category: "shopping", amountCents: -550000 })],
      committedRemaining: {},
      todayISO: "2026-04-15",
    });
    expect(h.status).toBe("over");
    expect(h.flexibleRemainingCents).toBe(-50000);
  });

  it("excludes income transactions from outflow", () => {
    const h = computeOverallHealth({
      monthlyIncomeCents: 500000,
      monthTransactions: [
        t({ category: "income", amountCents: 250000 }),
        t({ category: "groceries", amountCents: -10000 }),
      ],
      committedRemaining: {},
      todayISO: "2026-04-15",
    });
    expect(h.spentCents).toBe(10000);
  });

  it("excludes transfer transactions from outflow", () => {
    const h = computeOverallHealth({
      monthlyIncomeCents: 500000,
      monthTransactions: [
        t({ category: "transfer", amountCents: -50000 }),
        t({ category: "groceries", amountCents: -10000 }),
      ],
      committedRemaining: {},
      todayISO: "2026-04-15",
    });
    expect(h.spentCents).toBe(10000);
  });

  it("computes per-day budget from days remaining", () => {
    // 30-day month, day 15 → 16 days remaining including today
    const h = computeOverallHealth({
      monthlyIncomeCents: 500000,
      monthTransactions: [],
      committedRemaining: {},
      todayISO: "2026-04-15",
    });
    expect(h.daysRemaining).toBe(16);
    expect(h.perDayCents).toBe(Math.round(500000 / 16));
  });

  it("treats zero or negative income as unset", () => {
    expect(
      computeOverallHealth({
        monthlyIncomeCents: 0,
        monthTransactions: [],
        committedRemaining: {},
        todayISO: "2026-04-15",
      }).status,
    ).toBe("income-unset");
  });

  describe("savings target", () => {
    it("reports savings 'unset' when no target is set", () => {
      const h = computeOverallHealth({
        monthlyIncomeCents: 500000,
        monthTransactions: [],
        committedRemaining: {},
        todayISO: "2026-04-15",
      });
      expect(h.savingsStatus).toBe("unset");
      expect(h.savingsProgressCents).toBeNull();
    });

    it("savings on-track when flexible remaining ≥ target", () => {
      const h = computeOverallHealth({
        monthlyIncomeCents: 500000,
        monthlySavingsTargetCents: 100000, // $1000 target
        monthTransactions: [t({ amountCents: -50000 })],
        committedRemaining: {},
        todayISO: "2026-04-15",
      });
      // flex remaining = 500k - 50k = 450k > 100k target → on-track, progress capped at 100k
      expect(h.savingsStatus).toBe("on-track");
      expect(h.savingsProgressCents).toBe(100000);
    });

    it("savings behind when flexible remaining is 50-99% of target", () => {
      const h = computeOverallHealth({
        monthlyIncomeCents: 500000,
        monthlySavingsTargetCents: 100000,
        monthTransactions: [t({ amountCents: -430000 })], // leaves $700 flex
        committedRemaining: {},
        todayISO: "2026-04-15",
      });
      expect(h.savingsStatus).toBe("behind");
      expect(h.savingsProgressCents).toBe(70000);
    });

    it("savings off-track when flexible remaining < 50% of target", () => {
      const h = computeOverallHealth({
        monthlyIncomeCents: 500000,
        monthlySavingsTargetCents: 100000,
        monthTransactions: [t({ amountCents: -480000 })], // leaves $200 flex
        committedRemaining: {},
        todayISO: "2026-04-15",
      });
      expect(h.savingsStatus).toBe("off-track");
      expect(h.savingsProgressCents).toBe(20000);
    });

    it("treats zero or negative target as unset", () => {
      expect(
        computeOverallHealth({
          monthlyIncomeCents: 500000,
          monthlySavingsTargetCents: 0,
          monthTransactions: [],
          committedRemaining: {},
          todayISO: "2026-04-15",
        }).savingsStatus,
      ).toBe("unset");
    });
  });
});
