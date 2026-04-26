import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Account classes excluded from "spend math" (totals, projections, variable-
 * spend baseline, can-i-afford, etc).
 *
 * - savings: money flowing in or out of savings is a transfer from elsewhere;
 *   counting outflows would double-count the matching transaction-account
 *   spend, counting inflows isn't real income — they're savings deposits.
 *   Mirror-pair transfer detection catches the typical case anyway.
 * - investment: same reasoning — asset movement, not consumption.
 *
 * `transaction` and `credit-card` accounts ARE counted: each card swipe is a
 * real expense, and the matching bill payment is transfer-tagged separately
 * so we don't double-count.
 *
 * `mortgage` and `loan` are also counted — interest charges and loan
 * repayments are real outflows that hit the user's net cash position.
 * Excluding them would understate "money out" and let the on-track widget
 * lie. The user has to budget for them like anything else.
 */
export const NON_SPENDABLE_ACCOUNT_CLASSES = [
  "savings",
  "investment",
] as const;

/**
 * Used by every "spend total" query that filters at the transaction level.
 * Returns the basiq_account_id of accounts whose class is non-spendable.
 * Caller passes these to a NOT IN filter on `transactions.account_id`.
 *
 * Auth scoping: works equally with the request-scoped client (RLS scopes by
 * user) or the admin client (caller must scope by user_id explicitly).
 */
export async function fetchNonSpendableAccountIds(
  supabase: SupabaseClient,
  userId?: string,
): Promise<string[]> {
  let q = supabase
    .from("accounts")
    .select("basiq_account_id")
    .in("account_class", [...NON_SPENDABLE_ACCOUNT_CLASSES]);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) throw new Error(`fetchNonSpendableAccountIds failed: ${error.message}`);
  return (data ?? []).map((r) => r.basiq_account_id as string);
}
