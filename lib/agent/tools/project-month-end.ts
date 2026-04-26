import type { SupabaseClient } from "@supabase/supabase-js";
import {
  currentMonthSpend,
  projectMonthEnd,
  type CalcTransaction,
} from "@/lib/budgets/calc";
import { CATEGORY_VALUES, type Category } from "@/lib/db/schema";
import { fetchNonSpendableAccountIds } from "@/lib/budgets/spendable-accounts";

export interface ProjectionRow {
  category: Category;
  spent_cents: number;
  projected_cents: number;
}

/**
 * `project_month_end(category?)` — linear projection of month-end spend per
 * category from days elapsed. Single-category mode when category is provided.
 *
 * Pure days-elapsed projection (no recurring-aware adjustment) — matches what
 * the dashboard shows. The agent can layer reasoning on top.
 */
export async function projectMonthEndTool(
  supabase: SupabaseClient,
  userId: string,
  args: Record<string, unknown>,
  todayISO: string,
): Promise<{ today: string; rows: ProjectionRow[] }> {
  const categoryArg = typeof args.category === "string" ? args.category : null;
  const category = categoryArg && (CATEGORY_VALUES as readonly string[]).includes(categoryArg)
    ? (categoryArg as Category)
    : null;

  const monthStart = todayISO.slice(0, 8) + "01";
  const excludedAccountIds = await fetchNonSpendableAccountIds(supabase, userId);
  let q = supabase
    .from("transactions")
    .select("category, amount_cents, transaction_date")
    .eq("user_id", userId)
    .gte("transaction_date", monthStart)
    .lte("transaction_date", todayISO);
  if (excludedAccountIds.length > 0) {
    q = q.not("account_id", "in", `(${excludedAccountIds.join(",")})`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`project_month_end failed: ${error.message}`);

  const txns: CalcTransaction[] = (data ?? []).map((r) => ({
    category: r.category as Category | null,
    amountCents: r.amount_cents as number,
    transactionDate: r.transaction_date as string,
  }));
  const spend = currentMonthSpend(txns, todayISO);

  const target = category ? [category] : (CATEGORY_VALUES as readonly Category[]);
  const rows: ProjectionRow[] = target
    .filter((c) => c !== "income" && c !== "transfer")
    .map((c) => {
      const spent = spend[c] ?? 0;
      return {
        category: c,
        spent_cents: spent,
        projected_cents: projectMonthEnd(spent, todayISO),
      };
    });

  return { today: todayISO, rows };
}
