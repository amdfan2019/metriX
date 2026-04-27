import { describe, expect, it } from "vitest";
import { detectIncomeLateness } from "./income-lateness";
import type { AlertRecurringInput } from "./types";

const series = (overrides: Partial<AlertRecurringInput>): AlertRecurringInput => ({
  id: "acme",
  merchantName: "ACME PTY LTD",
  category: "income",
  cadence: "fortnightly",
  direction: "income",
  typicalAmountCents: 450000,
  nextExpectedDate: "2026-04-15",
  status: "active",
  ignored: false,
  legCount: 5,
  ...overrides,
});

describe("detectIncomeLateness", () => {
  it("flags an active income series whose next_expected_date is more than 2 days past", () => {
    const r = detectIncomeLateness(
      [series({ nextExpectedDate: "2026-04-15" })],
      [],
      { todayISO: "2026-04-25" },
    );
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe("income_late");
    expect(r[0].title).toContain("ACME PTY LTD");
  });

  it("does not flag within the 2-day grace window", () => {
    const r = detectIncomeLateness(
      [series({ nextExpectedDate: "2026-04-23" })],
      [],
      { todayISO: "2026-04-25" },
    );
    expect(r).toEqual([]);
  });

  it("does not flag when a matching deposit has already landed", () => {
    const r = detectIncomeLateness(
      [series({ nextExpectedDate: "2026-04-15" })],
      [
        {
          id: "deposit",
          transactionDate: "2026-04-22",
          description: "ACME PTY LTD SALARY",
          merchantName: "ACME PTY LTD",
          category: "income",
          amountCents: 450000,
          isTransfer: false,
          pending: false,
          recurringExpenseId: null,
        },
      ],
      { todayISO: "2026-04-25" },
    );
    expect(r).toEqual([]);
  });

  it("escalates severity by days late", () => {
    const inputs: AlertRecurringInput[] = [
      series({ id: "info", nextExpectedDate: "2026-04-22" }), // 3 days late
      series({ id: "warn", nextExpectedDate: "2026-04-20" }), // 5 days late
      series({ id: "critical", nextExpectedDate: "2026-04-18" }), // 7 days late
    ];
    const r = detectIncomeLateness(inputs, [], { todayISO: "2026-04-25" });
    const bySource = Object.fromEntries(r.map((a) => [a.sourceRecurringId, a]));
    expect(bySource.info.severity).toBe("info");
    expect(bySource.warn.severity).toBe("warn");
    expect(bySource.critical.severity).toBe("critical");
  });

  it("skips inactive, ignored, expense, or low-history series", () => {
    const r = detectIncomeLateness(
      [
        series({ id: "inactive", status: "inactive" }),
        series({ id: "ignored", ignored: true }),
        series({ id: "expense", direction: "expense" }),
        series({ id: "single-leg", legCount: 1 }),
      ],
      [],
      { todayISO: "2026-04-25" },
    );
    expect(r).toEqual([]);
  });

  it("uses dedup key based on series id + expected date", () => {
    const r = detectIncomeLateness(
      [series({ id: "acme", nextExpectedDate: "2026-04-15" })],
      [],
      { todayISO: "2026-04-25" },
    );
    expect(r[0].dedupKey).toBe("income_late:acme:2026-04-15");
  });
});
