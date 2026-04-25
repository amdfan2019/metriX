import { describe, expect, it } from "vitest";
import {
  budgetStatus,
  currentMonthSpend,
  projectMonthEnd,
  todaySydney,
  type CalcTransaction,
} from "./calc";

const t = (overrides: Partial<CalcTransaction>): CalcTransaction => ({
  category: "groceries",
  amountCents: -1000,
  transactionDate: "2026-04-15",
  ...overrides,
});

describe("currentMonthSpend", () => {
  it("sums absolute outflows per category for the current month", () => {
    const r = currentMonthSpend(
      [
        t({ category: "groceries", amountCents: -2500 }),
        t({ category: "groceries", amountCents: -1500 }),
        t({ category: "dining", amountCents: -3000 }),
      ],
      "2026-04-20",
    );
    expect(r).toEqual({ groceries: 4000, dining: 3000 });
  });

  it("ignores transactions outside the current month", () => {
    const r = currentMonthSpend(
      [
        t({ transactionDate: "2026-03-31", amountCents: -1000 }),
        t({ transactionDate: "2026-04-01", amountCents: -2000 }),
        t({ transactionDate: "2026-04-30", amountCents: -3000 }),
      ],
      "2026-04-30",
    );
    expect(r).toEqual({ groceries: 5000 });
  });

  it("excludes future-dated transactions (later in same month)", () => {
    const r = currentMonthSpend(
      [
        t({ transactionDate: "2026-04-10", amountCents: -1000 }),
        t({ transactionDate: "2026-04-25", amountCents: -9999 }),
      ],
      "2026-04-15",
    );
    expect(r).toEqual({ groceries: 1000 });
  });

  it("excludes positive amounts (refunds, income)", () => {
    const r = currentMonthSpend(
      [
        t({ category: "groceries", amountCents: -2000 }),
        t({ category: "groceries", amountCents: 500 }), // refund
      ],
      "2026-04-20",
    );
    expect(r).toEqual({ groceries: 2000 });
  });

  it("skips income and transfer categories from category burn", () => {
    const r = currentMonthSpend(
      [
        t({ category: "income", amountCents: -50000 }),
        t({ category: "transfer", amountCents: -120000 }),
        t({ category: "groceries", amountCents: -2000 }),
      ],
      "2026-04-20",
    );
    expect(r).toEqual({ groceries: 2000 });
  });

  it("skips transactions with null category", () => {
    const r = currentMonthSpend(
      [
        t({ category: null, amountCents: -1000 }),
        t({ category: "dining", amountCents: -1500 }),
      ],
      "2026-04-20",
    );
    expect(r).toEqual({ dining: 1500 });
  });

  it("returns empty object when no qualifying transactions exist", () => {
    expect(currentMonthSpend([], "2026-04-20")).toEqual({});
  });
});

describe("projectMonthEnd", () => {
  it("scales linearly from day elapsed to days in month", () => {
    // April has 30 days; day 15 with $300 → projects $600
    expect(projectMonthEnd(30000, "2026-04-15")).toBe(60000);
  });

  it("returns spent unchanged on the last day of the month", () => {
    expect(projectMonthEnd(45000, "2026-04-30")).toBe(45000);
  });

  it("handles February leap year (2024) — 29 days", () => {
    // day 1 with $100 → projects $2900
    expect(projectMonthEnd(10000, "2024-02-01")).toBe(290000);
  });

  it("handles February non-leap (2026) — 28 days", () => {
    expect(projectMonthEnd(10000, "2026-02-01")).toBe(280000);
  });

  it("rounds to the nearest cent", () => {
    // $10 on day 7 of 30 → 30/7 = 4.2857, $42.857 → 4286 cents
    expect(projectMonthEnd(1000, "2026-04-07")).toBe(4286);
  });
});

describe("budgetStatus", () => {
  it("returns 'ok' below 80%", () => {
    expect(budgetStatus(7900, 10000)).toBe("ok");
  });

  it("returns 'warn' at exactly 80%", () => {
    expect(budgetStatus(8000, 10000)).toBe("warn");
  });

  it("returns 'warn' between 80% and 100%", () => {
    expect(budgetStatus(9999, 10000)).toBe("warn");
  });

  it("returns 'over' at exactly 100%", () => {
    expect(budgetStatus(10000, 10000)).toBe("over");
  });

  it("returns 'over' above 100%", () => {
    expect(budgetStatus(15000, 10000)).toBe("over");
  });

  it("returns 'ok' for a zero or negative cap", () => {
    expect(budgetStatus(5000, 0)).toBe("ok");
    expect(budgetStatus(5000, -100)).toBe("ok");
  });
});

describe("todaySydney", () => {
  it("returns YYYY-MM-DD shape", () => {
    expect(todaySydney()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("formats in Sydney time, not UTC, near midnight rollover", () => {
    // 14:30 UTC on 2026-04-15 = 00:30 on 2026-04-16 in Sydney (AEST = UTC+10)
    const utcAt1430 = new Date("2026-04-15T14:30:00Z");
    expect(todaySydney(utcAt1430)).toBe("2026-04-16");
  });
});
