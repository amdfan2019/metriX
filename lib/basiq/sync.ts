import type { SupabaseClient } from "@supabase/supabase-js";
import { basiq } from "./client";
import { findTransferPairs, type PairableTransaction } from "./transfers";
import { rescanRecurringForUser } from "@/lib/recurring/scan";
import { todaySydney } from "@/lib/budgets/calc";

export interface SyncResult {
  pulled: number;
  upserted: number;
  transfers: number;
  recurringDetected: number;
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
      // Slice 4 fills category in via Gemini. Until then, leave NULL — calc
      // skips uncategorised transactions from category-budget burns.
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

  // Recurring detection runs after transfer detection so its inputs already
  // exclude transfer legs (the detector also filters them, but consistency
  // matters when a manual seed bypasses the transfer pass).
  const recurring = await rescanRecurringForUser(supabase, appUserId, todaySydney());

  await supabase
    .from("bank_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", appUserId);

  return {
    pulled: txns.length,
    upserted: txns.length,
    transfers,
    recurringDetected: recurring.detected,
  };
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
