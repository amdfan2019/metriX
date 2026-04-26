import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORY_VALUES, type Category } from "@/lib/db/schema";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NON_OUTFLOW = new Set<Category>(["income", "transfer"]);

/**
 * `get_spending_by_category(start_date, end_date)` — totals (positive cents)
 * spent in each category between two ISO dates inclusive. Income/transfer are
 * excluded; refunds (positive amount) are excluded.
 *
 * If start_date or end_date is malformed we throw — the model's prompt will
 * surface the error and let it retry with valid input.
 */
export async function getSpendingByCategory(
  supabase: SupabaseClient,
  userId: string,
  args: Record<string, unknown>,
): Promise<{ start_date: string; end_date: string; totals: Record<string, number>; total_cents: number }> {
  const start = String(args.start_date ?? "");
  const end = String(args.end_date ?? "");
  if (!ISO_DATE.test(start)) throw new Error("start_date must be YYYY-MM-DD");
  if (!ISO_DATE.test(end)) throw new Error("end_date must be YYYY-MM-DD");
  if (start > end) throw new Error("start_date must be on or before end_date");

  const { data, error } = await supabase
    .from("transactions")
    .select("category, amount_cents")
    .eq("user_id", userId)
    .eq("is_transfer", false)
    .gte("transaction_date", start)
    .lte("transaction_date", end)
    .lt("amount_cents", 0);
  if (error) throw new Error(`get_spending_by_category failed: ${error.message}`);

  const totals: Record<string, number> = {};
  let totalCents = 0;
  for (const c of CATEGORY_VALUES) totals[c] = 0;

  for (const r of data ?? []) {
    const cat = r.category as Category | null;
    if (!cat || NON_OUTFLOW.has(cat)) continue;
    const cents = Math.abs(r.amount_cents as number);
    totals[cat] = (totals[cat] ?? 0) + cents;
    totalCents += cents;
  }

  return { start_date: start, end_date: end, totals, total_cents: totalCents };
}
