import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/db/schema";
import type { CalcTransaction } from "./calc";

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
  const { data, error } = await supabase
    .from("transactions")
    .select("category, amount_cents, transaction_date")
    .gte("transaction_date", monthStart)
    .lte("transaction_date", todayISO);
  if (error) throw new Error(`fetchCurrentMonthTransactions failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    category: r.category as Category | null,
    amountCents: r.amount_cents as number,
    transactionDate: r.transaction_date as string,
  }));
}
