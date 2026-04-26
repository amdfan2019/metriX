import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Account classes excluded from "spend math" (totals, projections, variable-
 * spend baseline, can-i-afford, etc).
 *
 * - mortgage / loan: interest charges and principal repayments aren't
 *   discretionary spending. Excluding here keeps the on-track widget honest.
 * - savings: money flowing in or out of savings is a transfer from elsewhere;
 *   counting outflows would double-count, counting inflows isn't real income.
 * - investment: same reasoning — funds movement, not consumption.
 *
 * `transaction` and `credit-card` accounts ARE counted: each card swipe is a
 * real expense, and the matching bill payment is transfer-tagged separately
 * so we don't double-count.
 */
export const NON_SPENDABLE_ACCOUNT_CLASSES = [
  "mortgage",
  "loan",
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
