import { describe, expect, it } from "vitest";
import { suggestBudgets } from "./suggest";

describe("suggestBudgets", () => {
  it("returns all-zero rows when income is null", () => {
    const r = suggestBudgets(null, null);
    expect(r.spending_envelope_cents).toBe(0);
    expect(r.rows.every((row) => row.cents === 0)).toBe(true);
  });

  it("returns all-zero rows when savings target exceeds income", () => {
    const r = suggestBudgets(500000, 600000);
    expect(r.spending_envelope_cents).toBe(0);
    expect(r.rows.every((row) => row.cents === 0)).toBe(true);
  });

  it("splits a typical Sydney income (~$6k/mo) according to the default ratios", () => {
    // $6500 income, $1000 savings → $5500 envelope.
    const r = suggestBudgets(650000, 100000);
    expect(r.spending_envelope_cents).toBe(550000);
    const byCategory = Object.fromEntries(r.rows.map((row) => [row.category, row.cents]));

    // Rent ratio 36% of envelope = $1980; rounded to whole $.
    expect(byCategory.rent).toBe(198000);
    // Groceries 15% = $825 → $825 (already whole dollar).
    expect(byCategory.groceries).toBe(82500);
    // Utilities ratio 7% of $5500 = $385 → $385 — under the $400 cap.
    expect(byCategory.utilities).toBe(38500);
    // Subscriptions 3% of $5500 = $165 → $165 — under the $200 cap.
    expect(byCategory.subscriptions).toBe(16500);
  });

  it("caps utilities at $400/mo for high-income users and pushes the residue to 'other'", () => {
    // $20000/mo income, $3000 savings → $17000 envelope.
    // Utilities 7% of envelope = $1190 — well over $400 cap. Headroom $790 → "other".
    const r = suggestBudgets(2000000, 300000);
    const byCategory = Object.fromEntries(r.rows.map((row) => [row.category, row.cents]));
    expect(byCategory.utilities).toBe(40000); // capped at $400
    expect(r.uncapped_buffer_cents).toBeGreaterThanOrEqual(79000);
    // 'other' baseline is 2% of envelope = $340; with all the buffers piled in
    // it should be substantially larger than $340.
    expect(byCategory.other).toBeGreaterThan(34000);
  });

  it("rounds every per-category cap to whole dollars", () => {
    const r = suggestBudgets(123456, 12345);
    for (const row of r.rows) {
      expect(row.cents % 100).toBe(0);
    }
  });

  it("includes pct_of_income annotation on every row", () => {
    const r = suggestBudgets(500000, 75000);
    for (const row of r.rows) {
      expect(row.pct_of_income).toBeGreaterThanOrEqual(0);
      expect(row.pct_of_income).toBeLessThanOrEqual(100);
    }
  });

  it("treats null savings target as zero (allocates the entire income)", () => {
    const r = suggestBudgets(600000, null);
    expect(r.savings_target_cents).toBe(0);
    expect(r.spending_envelope_cents).toBe(600000);
  });
});
