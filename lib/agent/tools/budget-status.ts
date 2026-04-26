import type { SupabaseClient } from "@supabase/supabase-js";
import {
  budgetStatus,
  currentMonthSpend,
  projectMonthEnd,
  type CalcTransaction,
} from "@/lib/budgets/calc";
import type { Category } from "@/lib/db/schema";

export interface BudgetStatusRow {
  category: Category;
  monthly_cap_cents: number;
  spent_cents: number;
  projected_cents: number;
  status: "ok" | "warn" | "over";
  pct: number;
}

/**
 * `get_budget_status(month?: 'YYYY-MM')` — per-category spend vs budget for
 * the requested month (defaults to today's month).
 *
 * Returned amounts are positive cents. Categories with no budget set are
 * omitted (the model gets a focused view of what the user actually tracks).
 */
export async function getBudgetStatus(
  supabase: SupabaseClient,
  userId: string,
  args: Record<string, unknown>,
  todayISO: string,
): Promise<{ month: string; today: string; rows: BudgetStatusRow[] }> {
  const monthArg = typeof args.month === "string" ? args.month : null;
  const monthStr = monthArg && /^\d{4}-\d{2}$/.test(monthArg) ? monthArg : todayISO.slice(0, 7);
  const monthStart = `${monthStr}-01`;
  // For past months, treat the last day of the month as "today" so projection
  // returns spent unchanged.
  const isCurrent = monthStr === todayISO.slice(0, 7);
  const effectiveToday = isCurrent ? todayISO : endOfMonth(monthStart);

  const [{ data: budgetsData, error: bErr }, { data: txData, error: tErr }] = await Promise.all([
    supabase
      .from("budgets")
      .select("category, monthly_cap_cents")
      .eq("user_id", userId),
    supabase
      .from("transactions")
      .select("category, amount_cents, transaction_date")
      .eq("user_id", userId)
      .gte("transaction_date", monthStart)
      .lte("transaction_date", effectiveToday),
  ]);
  if (bErr) throw new Error(`get_budget_status: budgets fetch failed: ${bErr.message}`);
  if (tErr) throw new Error(`get_budget_status: txns fetch failed: ${tErr.message}`);

  const txns: CalcTransaction[] = (txData ?? []).map((r) => ({
    category: r.category as Category | null,
    amountCents: r.amount_cents as number,
    transactionDate: r.transaction_date as string,
  }));
  const spend = currentMonthSpend(txns, effectiveToday);

  const rows: BudgetStatusRow[] = (budgetsData ?? []).map((b) => {
    const category = b.category as Category;
    const cap = b.monthly_cap_cents as number;
    const spent = spend[category] ?? 0;
    const projected = projectMonthEnd(spent, effectiveToday);
    return {
      category,
      monthly_cap_cents: cap,
      spent_cents: spent,
      projected_cents: projected,
      status: budgetStatus(spent, cap),
      pct: cap > 0 ? Math.round((spent / cap) * 1000) / 10 : 0,
    };
  });

  return { month: monthStr, today: effectiveToday, rows };
}

function endOfMonth(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
}
