import { describe, expect, it } from "vitest";
import { decideAffordability } from "./can-i-afford";

const base = {
  category: "dining" as const,
  amountCents: 5000, // $50
  spentCents: 10000, // $100
  upcomingCommittedCents: 0,
  monthlyCapCents: 50000, // $500
  projectedAfterSpendCents: 30000,
};

describe("decideAffordability", () => {
  it("returns 'yes' when there's plenty of room and projection stays under cap", () => {
    const r = decideAffordability(base);
    expect(r.verdict).toBe("yes");
    expect(r.remaining_after_spend_cents).toBe(35000); // 500 - 100 - 0 - 50
  });

  it("returns 'no' when the spend would exceed remaining", () => {
    const r = decideAffordability({ ...base, amountCents: 50000 }); // $500 spend on $400 remaining
    expect(r.verdict).toBe("no");
    expect(r.remaining_after_spend_cents).toBeLessThan(0);
  });

  it("returns 'stretch' when remaining-after is positive but under 15% of cap", () => {
    // cap=500, spent=420, committed=0 → remaining = 80. Spend 70 → after = 10 (~2% of cap).
    const r = decideAffordability({
      ...base,
      spentCents: 42000,
      amountCents: 7000,
      projectedAfterSpendCents: 49000,
    });
    expect(r.verdict).toBe("stretch");
    expect(r.remaining_after_spend_cents).toBe(1000);
  });

  it("returns 'stretch' when projected month-end exceeds cap even if remaining-after is comfortable", () => {
    // cap=500, spent=100, committed=0, amount=10 → after = 390 (78% of cap, comfortable),
    // but projected is 600 (over cap).
    const r = decideAffordability({
      ...base,
      amountCents: 1000,
      projectedAfterSpendCents: 60000,
    });
    expect(r.verdict).toBe("stretch");
  });

  it("counts upcoming committed against the remaining pool", () => {
    // cap=500, spent=200, committed=200 → only 100 left. Spending 60 → after = 40 (8% of cap).
    const r = decideAffordability({
      ...base,
      spentCents: 20000,
      upcomingCommittedCents: 20000,
      amountCents: 6000,
      projectedAfterSpendCents: 40000,
    });
    expect(r.verdict).toBe("stretch"); // tight but positive
    expect(r.remaining_after_spend_cents).toBe(4000);
  });

  it("returns 'no' when committed alone would exceed cap", () => {
    const r = decideAffordability({
      ...base,
      spentCents: 30000,
      upcomingCommittedCents: 25000,
      amountCents: 1000,
    });
    expect(r.verdict).toBe("no");
    expect(r.remaining_in_category_cents).toBe(0); // floored at 0
  });

  it("returns 'yes' with no constraint when cap is null", () => {
    const r = decideAffordability({ ...base, monthlyCapCents: null });
    expect(r.verdict).toBe("yes");
    expect(r.monthly_cap_cents).toBeNull();
    expect(r.reasoning).toContain("No budget cap");
  });
});
