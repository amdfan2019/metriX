import type { SupabaseClient } from "@supabase/supabase-js";

export interface BalanceRow {
  account_name: string | null;
  account_class: string | null;
  account_type: string | null;
  current_balance_cents: number | null;
  available_balance_cents: number | null;
  balance_as_of: string | null;
  status: string;
}

/**
 * `get_balances()` — current balance + available balance per connected
 * account. Includes account class so the agent can tell apart everyday
 * accounts (counted as spendable) from savings/credit-card balances.
 */
export async function getBalances(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ rows: BalanceRow[]; spendable_balance_cents: number }> {
  const { data, error } = await supabase
    .from("accounts")
    .select(
      "account_name, account_class, account_type, current_balance_cents, available_balance_cents, balance_as_of, status",
    )
    .eq("user_id", userId)
    .order("account_class", { ascending: true });
  if (error) throw new Error(`get_balances failed: ${error.message}`);

  const rows: BalanceRow[] = (data ?? []).map((r) => ({
    account_name: (r.account_name as string | null) ?? null,
    account_class: (r.account_class as string | null) ?? null,
    account_type: (r.account_type as string | null) ?? null,
    current_balance_cents: (r.current_balance_cents as number | null) ?? null,
    available_balance_cents: (r.available_balance_cents as number | null) ?? null,
    balance_as_of: (r.balance_as_of as string | null) ?? null,
    status: r.status as string,
  }));

  // Sum the same way the dashboard does — only `transaction` accounts count.
  let spendable = 0;
  for (const r of rows) {
    if (r.account_class !== "transaction") continue;
    if (r.status !== "active" && r.status !== "available") continue;
    spendable += r.available_balance_cents ?? r.current_balance_cents ?? 0;
  }

  return { rows, spendable_balance_cents: spendable };
}
