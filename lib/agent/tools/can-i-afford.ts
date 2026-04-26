import type { SupabaseClient } from "@supabase/supabase-js";
import {
  currentMonthSpend,
  projectMonthEnd,
  type CalcTransaction,
} from "@/lib/budgets/calc";
import { CATEGORY_VALUES, type Category } from "@/lib/db/schema";

export type AffordVerdict = "yes" | "stretch" | "no";

export interface CanIAffordResult {
  verdict: AffordVerdict;
  category: Category;
  amount_cents: number;
  remaining_in_category_cents: number;
  remaining_after_spend_cents: number;
  projected_month_end_after_spend_cents: number;
  monthly_cap_cents: number | null;
  upcoming_committed_in_category_cents: number;
  reasoning: string;
}

/**
 * `can_i_afford(amount, category)` — should the user spend `amount` (dollars,
 * positive) in `category` right now?
 *
 * Math:
 *   remaining_in_category = cap − spent − upcoming_committed_in_category
 *   remaining_after_spend = remaining_in_category − amount
 *
 * Verdict:
 *   yes      — remaining_after_spend >= 15% of cap
 *   stretch  — remaining_after_spend > 0 but < 15% of cap, OR projected month-end
 *              would exceed cap
 *   no       — remaining_after_spend <= 0
 *
 * If the category has no budget set we still surface the data — the agent gets
 * verdict 'yes' for any non-negative spend with `monthly_cap_cents = null` and
 * tells the user there's no budget to constrain it.
 */
export async function canIAfford(
  supabase: SupabaseClient,
  userId: string,
  args: Record<string, unknown>,
  todayISO: string,
): Promise<CanIAffordResult> {
  const amountDollars = Number(args.amount);
  if (!Number.isFinite(amountDollars) || amountDollars < 0) {
    throw new Error("amount must be a non-negative number (dollars)");
  }
  const amountCents = Math.round(amountDollars * 100);

  const categoryArg = String(args.category ?? "");
  if (!(CATEGORY_VALUES as readonly string[]).includes(categoryArg)) {
    throw new Error(`category must be one of: ${CATEGORY_VALUES.join(", ")}`);
  }
  const category = categoryArg as Category;

  // Spent so far this month in this category.
  const monthStart = todayISO.slice(0, 8) + "01";
  const { data: txData, error: txErr } = await supabase
    .from("transactions")
    .select("category, amount_cents, transaction_date")
    .eq("user_id", userId)
    .gte("transaction_date", monthStart)
    .lte("transaction_date", todayISO);
  if (txErr) throw new Error(`can_i_afford: txns fetch failed: ${txErr.message}`);
  const txns: CalcTransaction[] = (txData ?? []).map((r) => ({
    category: r.category as Category | null,
    amountCents: r.amount_cents as number,
    transactionDate: r.transaction_date as string,
  }));
  const spend = currentMonthSpend(txns, todayISO);
  const spent = spend[category] ?? 0;

  // Upcoming committed in this category from active recurring expenses.
  const monthEnd = endOfMonth(todayISO);
  const { data: recurringData, error: rErr } = await supabase
    .from("recurring_expenses")
    .select("category, typical_amount_cents, next_expected_date")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("ignored", false)
    .eq("category", category)
    .gt("next_expected_date", todayISO)
    .lte("next_expected_date", monthEnd);
  if (rErr) throw new Error(`can_i_afford: recurring fetch failed: ${rErr.message}`);
  const upcomingCommitted = (recurringData ?? []).reduce(
    (sum, r) => sum + (r.typical_amount_cents as number),
    0,
  );

  // Cap (if any).
  const { data: budgetData, error: bErr } = await supabase
    .from("budgets")
    .select("monthly_cap_cents")
    .eq("user_id", userId)
    .eq("category", category)
    .maybeSingle();
  if (bErr) throw new Error(`can_i_afford: budget fetch failed: ${bErr.message}`);
  const cap = budgetData ? (budgetData.monthly_cap_cents as number) : null;

  const projected = projectMonthEnd(spent + amountCents, todayISO);
  const result = decideAffordability({
    category,
    amountCents,
    spentCents: spent,
    upcomingCommittedCents: upcomingCommitted,
    monthlyCapCents: cap,
    projectedAfterSpendCents: projected,
  });
  return result;
}

export interface AffordInputs {
  category: Category;
  amountCents: number;
  spentCents: number;
  upcomingCommittedCents: number;
  monthlyCapCents: number | null;
  projectedAfterSpendCents: number;
}

/**
 * Pure decision logic — extracted so we can unit-test without DB plumbing.
 *
 * Verdict rules:
 *   - cap unset → 'yes' with no constraint
 *   - remaining_after_spend <= 0 → 'no'
 *   - remaining_after_spend < 15% of cap OR projected_month_end > cap → 'stretch'
 *   - otherwise → 'yes'
 */
export function decideAffordability(inputs: AffordInputs): CanIAffordResult {
  const {
    category,
    amountCents,
    spentCents,
    upcomingCommittedCents,
    monthlyCapCents,
    projectedAfterSpendCents,
  } = inputs;

  if (monthlyCapCents == null) {
    return {
      verdict: "yes",
      category,
      amount_cents: amountCents,
      remaining_in_category_cents: 0,
      remaining_after_spend_cents: 0,
      projected_month_end_after_spend_cents: projectedAfterSpendCents,
      monthly_cap_cents: null,
      upcoming_committed_in_category_cents: upcomingCommittedCents,
      reasoning: `No budget cap set for ${category}, so there's no constraint. You've spent ${fmt(spentCents)} so far this month and have ${fmt(upcomingCommittedCents)} of upcoming recurring charges.`,
    };
  }

  const remainingInCategory = Math.max(0, monthlyCapCents - spentCents - upcomingCommittedCents);
  const remainingAfter = remainingInCategory - amountCents;
  const fifteenPctOfCap = Math.round(monthlyCapCents * 0.15);

  let verdict: AffordVerdict;
  let reasoning: string;
  if (remainingAfter <= 0) {
    verdict = "no";
    reasoning = `Spending ${fmt(amountCents)} on ${category} would put you ${fmt(Math.abs(remainingAfter))} over the ${fmt(monthlyCapCents)} cap once the ${fmt(upcomingCommittedCents)} of upcoming recurring is counted.`;
  } else if (remainingAfter < fifteenPctOfCap || projectedAfterSpendCents > monthlyCapCents) {
    verdict = "stretch";
    reasoning = `Affordable but tight — you'd have ${fmt(remainingAfter)} left in ${category} after this${projectedAfterSpendCents > monthlyCapCents ? `, and current pace projects ${fmt(projectedAfterSpendCents)} for month-end, above the ${fmt(monthlyCapCents)} cap` : ""}.`;
  } else {
    verdict = "yes";
    reasoning = `Comfortable — ${fmt(remainingAfter)} left in ${category} after this charge, with cap at ${fmt(monthlyCapCents)}.`;
  }

  return {
    verdict,
    category,
    amount_cents: amountCents,
    remaining_in_category_cents: remainingInCategory,
    remaining_after_spend_cents: remainingAfter,
    projected_month_end_after_spend_cents: projectedAfterSpendCents,
    monthly_cap_cents: monthlyCapCents,
    upcoming_committed_in_category_cents: upcomingCommittedCents,
    reasoning,
  };
}

function fmt(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function endOfMonth(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
}
