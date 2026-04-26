import { describe, expect, it } from "vitest";
import {
  baselineVariableSpend,
  findRiskDays,
  simulateCashflow,
  type RecurringStreamInput,
  type SimulateInput,
} from "./simulate";

const baseInput = (overrides: Partial<SimulateInput> = {}): SimulateInput => ({
  startBalanceCents: 100000, // $1000
  startDate: "2026-04-26",
  streams: [],
  variableSpendCentsPerDay: 0,
  days: 5,
  ...overrides,
});

describe("simulateCashflow", () => {
  it("returns one row per day with the start balance when no events apply", () => {
    const out = simulateCashflow(baseInput({ days: 3 }));
    expect(out).toHaveLength(3);
    expect(out.map((d) => d.date)).toEqual(["2026-04-26", "2026-04-27", "2026-04-28"]);
    expect(out.every((d) => d.projectedBalanceCents === 100000)).toBe(true);
  });

  it("applies a daily variable spend baseline as outflow", () => {
    const out = simulateCashflow(
      baseInput({ days: 3, variableSpendCentsPerDay: 10000 }),
    );
    expect(out[0].projectedBalanceCents).toBe(90000); // 100000 - 10000
    expect(out[1].projectedBalanceCents).toBe(80000);
    expect(out[2].projectedBalanceCents).toBe(70000);
    expect(out[0].events[0].type).toBe("variable-spend");
  });

  it("applies a recurring expense on the day it's expected, then advances", () => {
    const stream: RecurringStreamInput = {
      id: "agl",
      merchantName: "AGL",
      cadence: "monthly",
      typicalAmountCents: 20000, // $200
      nextExpectedDate: "2026-04-28",
      direction: "expense",
    };
    const out = simulateCashflow(baseInput({ streams: [stream], days: 35 }));
    expect(out[0].projectedBalanceCents).toBe(100000); // 26th — no event
    expect(out[1].projectedBalanceCents).toBe(100000); // 27th — no event
    expect(out[2].projectedBalanceCents).toBe(80000); // 28th — AGL hits
    const aglDay = out[2];
    expect(aglDay.events.some((e) => e.label === "AGL" && e.type === "recurring-expense")).toBe(
      true,
    );
    // Next monthly hit should be ~30 days later, around May 28th.
    const nextHit = out.findIndex(
      (d, i) => i > 2 && d.events.some((e) => e.streamId === "agl"),
    );
    expect(nextHit).toBe(32); // 30 day cadence center
  });

  it("applies a recurring income on the day it's expected, increasing balance", () => {
    const stream: RecurringStreamInput = {
      id: "salary",
      merchantName: "ACME",
      cadence: "fortnightly",
      typicalAmountCents: 200000, // $2000
      nextExpectedDate: "2026-04-28",
      direction: "income",
    };
    const out = simulateCashflow(baseInput({ streams: [stream], days: 5 }));
    expect(out[2].projectedBalanceCents).toBe(300000); // 28th — paycheck lands
    expect(out[2].events[0].type).toBe("recurring-income");
  });

  it("walks down to negative balance when outflows exceed start balance", () => {
    // $300 start, $50/day spend, $400 bill on day 5 → bottoms out around day 5.
    const stream: RecurringStreamInput = {
      id: "rent",
      merchantName: "Rent",
      cadence: "monthly",
      typicalAmountCents: 40000,
      nextExpectedDate: "2026-04-30",
      direction: "expense",
    };
    const out = simulateCashflow(
      baseInput({
        startBalanceCents: 30000,
        variableSpendCentsPerDay: 5000,
        streams: [stream],
        days: 7,
      }),
    );
    // Day 5 (Apr 30) hits Rent $400 + $50 spend → big drop.
    expect(out[4].projectedBalanceCents).toBeLessThan(0);
  });

  it("treats past nextExpectedDate as 'today' so we don't backfill", () => {
    const stream: RecurringStreamInput = {
      id: "old",
      merchantName: "Bill",
      cadence: "monthly",
      typicalAmountCents: 10000,
      nextExpectedDate: "2026-01-01", // way in the past
      direction: "expense",
    };
    const out = simulateCashflow(baseInput({ streams: [stream], days: 3 }));
    // The first day of simulation is the start date; past nextExpected gets
    // pulled forward to today, so the bill hits day 0.
    expect(out[0].events.some((e) => e.label === "Bill")).toBe(true);
    expect(out[0].projectedBalanceCents).toBe(90000);
  });
});

describe("findRiskDays", () => {
  it("returns nothing when balance stays above the buffer", () => {
    const forecast = simulateCashflow(baseInput({ days: 5 }));
    expect(findRiskDays(forecast, 50000)).toEqual([]);
  });

  it("flags every day below the buffer with the trigger event", () => {
    const stream: RecurringStreamInput = {
      id: "rent",
      merchantName: "Rent",
      cadence: "monthly",
      typicalAmountCents: 80000,
      nextExpectedDate: "2026-04-28",
      direction: "expense",
    };
    const forecast = simulateCashflow(
      baseInput({ streams: [stream], days: 5, variableSpendCentsPerDay: 1000 }),
    );
    const risks = findRiskDays(forecast, 50000);
    // After the rent hit balance is 100000 - 80000 - daily 1000s = ~$199 on day 2 → below $500 buffer.
    expect(risks.length).toBeGreaterThan(0);
    expect(risks[0].triggerLabel).toBe("Rent");
    expect(risks[0].triggerType).toBe("recurring-expense");
  });

  it("labels carry-forward when only variable spend brought us under", () => {
    const forecast = simulateCashflow(
      baseInput({ days: 30, variableSpendCentsPerDay: 4000 }),
    );
    // 100000 cents start, 4000/day → drops below $500 around day 24.
    const risks = findRiskDays(forecast, 50000);
    expect(risks.length).toBeGreaterThan(0);
    expect(risks[0].triggerType).toBe("carry-forward");
  });
});

describe("baselineVariableSpend", () => {
  it("returns 0 when there's no data", () => {
    expect(baselineVariableSpend([])).toBe(0);
  });

  it("returns the median when n is odd", () => {
    expect(baselineVariableSpend([1000, 5000, 3000])).toBe(3000);
  });

  it("averages the two middle values when n is even", () => {
    expect(baselineVariableSpend([1000, 2000, 3000, 4000])).toBe(2500);
  });

  it("ignores spikes — a single $5000 day among $30 days doesn't dominate the median", () => {
    const days = [3000, 3500, 2800, 3200, 500000, 2900];
    // Sorted: 2800, 2900, 3000, 3200, 3500, 500000
    // n=6 → median is avg(3000, 3200) = 3100.
    expect(baselineVariableSpend(days)).toBe(3100);
  });
});
