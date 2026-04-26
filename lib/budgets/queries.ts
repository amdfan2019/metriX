import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/db/schema";
import type { CalcTransaction } from "./calc";
// Re-exported for consumers that built around it; the canonical source is
// in spendable-accounts.ts.
import { fetchNonSpendableAccountIds } from "./spendable-accounts";

export interface BudgetRow {
  category: Category;
  monthlyCapCents: number;
}

/** Fetch the signed-in user's budgets. RLS scopes this to their own rows. */
export async function fetchUserBudgets(): Promise<BudgetRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budgets")
    .select("category, monthly_cap_cents");
  if (error) throw new Error(`fetchUserBudgets failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    category: r.category as Category,
    monthlyCapCents: r.monthly_cap_cents as number,
  }));
}

/** Returns transactions in the current calendar month (Sydney) up to and including `todayISO`. */
export async function fetchCurrentMonthTransactions(todayISO: string): Promise<CalcTransaction[]> {
  const supabase = await createClient();
  const monthStart = todayISO.slice(0, 8) + "01";
  const excludedAccountIds = await fetchNonSpendableAccountIds(supabase);
  let query = supabase
    .from("transactions")
    .select("category, amount_cents, transaction_date")
    .gte("transaction_date", monthStart)
    .lte("transaction_date", todayISO);
  if (excludedAccountIds.length > 0) {
    query = query.not("account_id", "in", `(${excludedAccountIds.join(",")})`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`fetchCurrentMonthTransactions failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    category: r.category as Category | null,
    amountCents: r.amount_cents as number,
    transactionDate: r.transaction_date as string,
  }));
}

/** Sum of this month's outflows per category that are linked to a recurring series. */
export async function fetchRecurringSpentByCategory(todayISO: string): Promise<Partial<Record<Category, number>>> {
  const supabase = await createClient();
  const monthStart = todayISO.slice(0, 8) + "01";
  const excludedAccountIds = await fetchNonSpendableAccountIds(supabase);
  let query = supabase
    .from("transactions")
    .select("category, amount_cents")
    .gte("transaction_date", monthStart)
    .lte("transaction_date", todayISO)
    .not("recurring_expense_id", "is", null)
    .lt("amount_cents", 0)
    .eq("is_transfer", false);
  if (excludedAccountIds.length > 0) {
    query = query.not("account_id", "in", `(${excludedAccountIds.join(",")})`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`fetchRecurringSpentByCategory failed: ${error.message}`);
  const out: Partial<Record<Category, number>> = {};
  for (const r of data ?? []) {
    const cat = r.category as Category | null;
    if (!cat) continue;
    if (cat === "income" || cat === "transfer") continue;
    out[cat] = (out[cat] ?? 0) + Math.abs(r.amount_cents as number);
  }
  return out;
}
