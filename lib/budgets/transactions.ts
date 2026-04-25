import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/db/schema";

export interface TransactionListRow {
  id: string;
  description: string;
  category: Category | null;
  amountCents: number;
  transactionDate: string;
  pending: boolean;
  isTransfer: boolean;
  fromBasiq: boolean;
}

interface FetchTransactionsOptions {
  limit?: number;
  /** ISO date — only transactions on or after this date. */
  since?: string;
}

export async function fetchUserTransactions(
  options: FetchTransactionsOptions = {},
): Promise<TransactionListRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("transactions")
    .select("id, description, category, amount_cents, transaction_date, pending, is_transfer, basiq_transaction_id")
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (options.since) query = query.gte("transaction_date", options.since);
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw new Error(`fetchUserTransactions failed: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    description: r.description as string,
    category: r.category as Category | null,
    amountCents: r.amount_cents as number,
    transactionDate: r.transaction_date as string,
    pending: r.pending as boolean,
    isTransfer: r.is_transfer as boolean,
    fromBasiq: r.basiq_transaction_id != null,
  }));
}
