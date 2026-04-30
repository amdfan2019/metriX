import type { SupabaseClient } from "@supabase/supabase-js";
import { basiq } from "./client";
import { findTransferPairs, type PairableTransaction } from "./transfers";
import { rescanRecurringForUser } from "@/lib/recurring/scan";
import { rescanAlertsForUser } from "@/lib/alerts/scan";
import { todaySydney } from "@/lib/budgets/calc";

export interface SyncResult {
  pulled: number;
  upserted: number;
  transfers: number;
  recurringDetected: number;
  accountsUpserted: number;
}

/** Convert Basiq's decimal-string balance to integer cents. Null-safe. */
function decimalToCents(value: string | undefined | null): number | null {
  if (value == null) return null;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

interface SyncOptions {
  /** ISO date (YYYY-MM-DD). When set, only fetch transactions posted after this date. */
  since?: string;
}

/**
 * Pulls transactions from Basiq for the given Basiq user, normalises them, and
 * upserts into our `transactions` table. After upsert, runs transfer detection
 * over the user's full transaction set.
 */
export async function syncTransactionsForUser(
  supabase: SupabaseClient,
  appUserId: string,
  basiqUserId: string,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const filter = options.since ? `transaction.postDate.gt('${options.since}')` : undefined;
  const txns = await basiq.listTransactions(basiqUserId, { filter });

  if (txns.length > 0) {
    const rows = txns.map((t) => ({
      user_id: appUserId,
      description: t.description ?? "(no description)",
      // category is filled in later by the Gemini-driven resolver. Leaving
      // NULL — calc skips uncategorised transactions from category-budget burns.
      category: null,
      amount_cents: Math.round(parseFloat(t.amount) * 100),
      transaction_date:
        t.transactionDate ?? t.postDate ?? new Date().toISOString().slice(0, 10),
      basiq_transaction_id: t.id,
      account_id: t.account,
      pending: t.status === "pending",
      is_transfer: false,
    }));

    const { error } = await supabase
      .from("transactions")
      .upsert(rows, { onConflict: "basiq_transaction_id" });
    if (error) throw new Error(`Sync upsert failed: ${error.message}`);
  }

  const transfers = await detectTransfersForUser(supabase, appUserId);

  // Pull the latest account balances. Drives the cashflow forecast and the
  // dashboard balance card. Failures here don't fail the whole sync —
  // transactions are the primary signal.
  let accountsUpserted = 0;
  try {
    accountsUpserted = await syncAccountsForUser(supabase, appUserId, basiqUserId);
  } catch (e) {
    console.error(`[sync] account pull failed for ${appUserId}:`, e);
  }

  // Recurring detection runs after transfer detection so its inputs already
  // exclude transfer legs (the detector also filters them, but consistency
  // matters when a manual seed bypasses the transfer pass).
  const today = todaySydney();
  const recurring = await rescanRecurringForUser(supabase, appUserId, today);

  // Alert scan runs LAST — every other signal feeds it (transactions,
  // recurring, budgets). Failures here don't fail the sync; alerts are
  // additive intelligence on top of the primary data.
  try {
    await rescanAlertsForUser(supabase, appUserId, today);
  } catch (e) {
    console.error(`[sync] alert scan failed for ${appUserId}:`, e);
  }

  await supabase
    .from("bank_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", appUserId);

  return {
    pulled: txns.length,
    upserted: txns.length,
    transfers,
    recurringDetected: recurring.detected,
    accountsUpserted,
  };
}

/**
 * Pulls the user's Basiq account list and upserts into the `accounts` table.
 * Each row carries current + available balance plus account-class metadata
 * so the cashflow simulator knows which accounts count as spendable.
 */
export async function syncAccountsForUser(
  supabase: SupabaseClient,
  appUserId: string,
  basiqUserId: string,
): Promise<number> {
  const accounts = await basiq.listAccounts(basiqUserId);
  if (accounts.length === 0) return 0;

  const rows = accounts.map((a) => ({
    user_id: appUserId,
    basiq_account_id: a.id,
    basiq_user_id: basiqUserId,
    institution_name: null as string | null, // resolved separately if needed
    account_name: a.name ?? null,
    account_number: a.accountNo ?? null,
    account_type: a.class?.product ?? null,
    account_class: a.class?.type ?? null,
    current_balance_cents: decimalToCents(a.balance),
    available_balance_cents: decimalToCents(a.availableFunds),
    currency: a.currency ?? "AUD",
    status: a.status ?? "active",
    balance_as_of: a.lastUpdated ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("accounts")
    .upsert(rows, { onConflict: "user_id,basiq_account_id" });
  if (error) throw new Error(`Account upsert failed: ${error.message}`);
  return rows.length;
}

/**
 * Re-runs transfer detection across all of `appUserId`'s transactions and
 * marks pairs as is_transfer + category=transfer. Returns the number of legs flagged.
 */
export async function detectTransfersForUser(
  supabase: SupabaseClient,
  appUserId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, amount_cents, transaction_date, description, account_id")
    .eq("user_id", appUserId);
  if (error) throw new Error(`Transfer-detect query failed: ${error.message}`);

  const candidates: PairableTransaction[] = (data ?? []).map((r) => ({
    id: r.id as string,
    amountCents: r.amount_cents as number,
    transactionDate: r.transaction_date as string,
    description: r.description as string,
    accountId: r.account_id as string | null,
  }));

  const transferIds = findTransferPairs(candidates);
  if (transferIds.size === 0) return 0;

  const { error: updateError } = await supabase
    .from("transactions")
    .update({ is_transfer: true, category: "transfer" })
    .in("id", Array.from(transferIds));
  if (updateError) throw new Error(`Transfer-detect update failed: ${updateError.message}`);

  return transferIds.size;
}
