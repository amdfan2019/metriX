import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORY_VALUES, type Category } from "@/lib/db/schema";
import { addDays } from "@/lib/recurring/cadence";

export interface RecentTransactionRow {
  id: string;
  date: string;
  description: string;
  merchant_name: string | null;
  category: Category | null;
  amount_cents: number;
  pending: boolean;
}

const DEFAULT_DAYS = 30;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * `get_recent_transactions(category?, days?, limit?)` — most recent N transactions,
 * optionally filtered by category and look-back window. Pending and posted both
 * included; transfers are filtered out (they aren't actually spend the user
 * likely cares about when asking "what have I been buying").
 */
export async function getRecentTransactions(
  supabase: SupabaseClient,
  userId: string,
  args: Record<string, unknown>,
  todayISO: string,
): Promise<{ rows: RecentTransactionRow[] }> {
  const categoryArg = typeof args.category === "string" ? args.category : null;
  const category = categoryArg && (CATEGORY_VALUES as readonly string[]).includes(categoryArg)
    ? (categoryArg as Category)
    : null;

  const daysArg = Number(args.days);
  const days = Number.isFinite(daysArg) && daysArg > 0 && daysArg <= 365 ? Math.floor(daysArg) : DEFAULT_DAYS;

  const limitArg = Number(args.limit);
  const limit = Number.isFinite(limitArg) && limitArg > 0
    ? Math.min(MAX_LIMIT, Math.floor(limitArg))
    : DEFAULT_LIMIT;

  const since = addDays(todayISO, -days);

  let query = supabase
    .from("transactions")
    .select("id, transaction_date, description, merchant_name, category, amount_cents, pending")
    .eq("user_id", userId)
    .eq("is_transfer", false)
    .gte("transaction_date", since)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) throw new Error(`get_recent_transactions failed: ${error.message}`);

  const rows: RecentTransactionRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    date: r.transaction_date as string,
    description: r.description as string,
    merchant_name: (r.merchant_name as string | null) ?? null,
    category: (r.category as Category | null) ?? null,
    amount_cents: r.amount_cents as number,
    pending: r.pending as boolean,
  }));
  return { rows };
}
