import { describe, expect, it } from "vitest";
import { detectRecurringPriceChanges } from "./price-changes";
import type { AlertRecurringInput, AlertTxnInput } from "./types";

const series = (overrides: Partial<AlertRecurringInput>): AlertRecurringInput => ({
  id: "spotify",
  merchantName: "Spotify",
  category: "entertainment",
  cadence: "monthly",
  direction: "expense",
  typicalAmountCents: 1399,
  nextExpectedDate: "2026-05-18",
  status: "active",
  ignored: false,
  legCount: 12,
  ...overrides,
});

const leg = (
  recurringId: string,
  amountCents: number,
  transactionDate: string,
): AlertTxnInput => ({
  id: `leg-${recurringId}-${transactionDate}`,
  transactionDate,
  description: "SPOTIFY",
  merchantName: "Spotify",
  category: "entertainment",
  amountCents,
  isTransfer: false,
  pending: false,
  recurringExpenseId: recurringId,
});

describe("detectRecurringPriceChanges", () => {
  it("flags a 15%+ price increase on a recent leg", () => {
    const r = detectRecurringPriceChanges(
      [series({ typicalAmountCents: 1399 })],
      [leg("spotify", -1799, "2026-04-20")],
      { todayISO: "2026-04-26" },
    );
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe("price_change");
    expect(r[0].title).toContain("Spotify");
    expect(r[0].dedupKey).toBe("price_change:spotify:1799");
  });

  it("doesn't flag a price drop within 15%", () => {
    const r = detectRecurringPriceChanges(
      [series({ typicalAmountCents: 1399 })],
      [leg("spotify", -1300, "2026-04-20")],
      { todayISO: "2026-04-26" },
    );
    expect(r).toEqual([]);
  });

  it("does flag a meaningful drop (≥15%)", () => {
    const r = detectRecurringPriceChanges(
      [series({ typicalAmountCents: 1399 })],
      [leg("spotify", -800, "2026-04-20")],
      { todayISO: "2026-04-26" },
    );
    expect(r).toHaveLength(1);
    expect(r[0].title).toContain("decrease");
  });

  it("ignores tiny dollar changes even when % is high (Google $4.49 → $5.49 noise)", () => {
    const r = detectRecurringPriceChanges(
      [series({ id: "google", merchantName: "Google", typicalAmountCents: 449 })],
      [leg("google", -549, "2026-04-20")],
      { todayISO: "2026-04-26" },
    );
    // 22% increase but only $1 absolute → suppressed by the 100-cent floor.
    expect(r).toEqual([]);
  });

  it("ignores legs older than the window (default 14 days)", () => {
    const r = detectRecurringPriceChanges(
      [series({ typicalAmountCents: 1399 })],
      [leg("spotify", -1799, "2026-04-01")],
      { todayISO: "2026-04-26" },
    );
    expect(r).toEqual([]);
  });

  it("skips inactive / ignored / income / unmatched series", () => {
    const r = detectRecurringPriceChanges(
      [
        series({ id: "inactive", status: "inactive" }),
        series({ id: "ignored", ignored: true }),
        series({ id: "income", direction: "income" }),
      ],
      [
        leg("inactive", -1799, "2026-04-20"),
        leg("ignored", -1799, "2026-04-20"),
        leg("income", 600000, "2026-04-20"),
      ],
      { todayISO: "2026-04-26" },
    );
    expect(r).toEqual([]);
  });

  it("severity tracks dollar delta", () => {
    const r = detectRecurringPriceChanges(
      [
        series({ id: "small", merchantName: "A", typicalAmountCents: 1000 }),
        series({ id: "med", merchantName: "B", typicalAmountCents: 5000 }),
        series({ id: "big", merchantName: "C", typicalAmountCents: 20000 }),
      ],
      [
        leg("small", -1300, "2026-04-20"), // +$3 = info
        leg("med", -7000, "2026-04-20"), // +$20 = warn (over $15)
        leg("big", -28000, "2026-04-20"), // +$80 = critical (over $50)
      ],
      { todayISO: "2026-04-26" },
    );
    const byId = Object.fromEntries(r.map((a) => [a.sourceRecurringId, a]));
    expect(byId.small.severity).toBe("info");
    expect(byId.med.severity).toBe("warn");
    expect(byId.big.severity).toBe("critical");
  });
});
