import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cadence, Category } from "@/lib/db/schema";
import { detectTransactionAnomalies } from "./transaction-anomalies";
import { detectRecurringPriceChanges } from "./price-changes";
import { detectPendingInterceptions } from "./pending-interceptions";
import { detectIncomeLateness } from "./income-lateness";
import type { AlertCandidate, AlertRecurringInput, AlertTxnInput } from "./types";

export interface AlertScanSummary {
  generated: number;
  inserted: number;
  resolved: number;
}

/**
 * Runs every alert detector for a single user, upserts the resulting
 * candidates by `(user_id, dedup_key)`, and auto-resolves any prior open
 * alerts whose underlying condition no longer fires.
 *
 * Idempotent — re-running is safe and won't duplicate alerts. Auto-resolution
 * means dismissed/snoozed alerts stay sticky; only `open` alerts whose
 * dedup key isn't in this scan's output get flipped to `resolved`.
 *
 * Wired into syncTransactionsForUser so this fires on every Basiq sync (or
 * manual data change). Pure detectors are tested in their own files; this
 * layer just plumbs DB I/O.
 */
export async function rescanAlertsForUser(
  supabase: SupabaseClient,
  userId: string,
  todayISO: string,
): Promise<AlertScanSummary> {
  const summary: AlertScanSummary = { generated: 0, inserted: 0, resolved: 0 };

  // -- Inputs ---------------------------------------------------------------
  // Pull ~6 months of transactions so the anomaly baseline has enough samples.
  const since = addDaysISO(todayISO, -180);
  const { data: txnRows, error: txnErr } = await supabase
    .from("transactions")
    .select(
      "id, transaction_date, description, merchant_name, category, amount_cents, is_transfer, pending, recurring_expense_id",
    )
    .eq("user_id", userId)
    .gte("transaction_date", since);
  if (txnErr) throw new Error(`alerts scan: txn fetch failed: ${txnErr.message}`);
  const txns: AlertTxnInput[] = (txnRows ?? []).map((r) => ({
    id: r.id as string,
    transactionDate: r.transaction_date as string,
    description: r.description as string,
    merchantName: (r.merchant_name as string | null) ?? null,
    category: r.category as Category | null,
    amountCents: r.amount_cents as number,
    isTransfer: r.is_transfer as boolean,
    pending: r.pending as boolean,
    recurringExpenseId: (r.recurring_expense_id as string | null) ?? null,
  }));

  const { data: recurringRows, error: recErr } = await supabase
    .from("recurring_expenses")
    .select(
      "id, merchant_name, category, cadence, direction, typical_amount_cents, next_expected_date, status, ignored, leg_count",
    )
    .eq("user_id", userId);
  if (recErr) throw new Error(`alerts scan: recurring fetch failed: ${recErr.message}`);
  const recurring: AlertRecurringInput[] = (recurringRows ?? []).map((r) => ({
    id: r.id as string,
    merchantName: r.merchant_name as string,
    category: r.category as Category,
    cadence: r.cadence as Cadence,
    direction: r.direction as "expense" | "income",
    typicalAmountCents: r.typical_amount_cents as number,
    nextExpectedDate: r.next_expected_date as string,
    status: r.status as "active" | "inactive",
    ignored: r.ignored as boolean,
    legCount: r.leg_count as number,
  }));

  const { data: budgetRows, error: bErr } = await supabase
    .from("budgets")
    .select("category, monthly_cap_cents")
    .eq("user_id", userId);
  if (bErr) throw new Error(`alerts scan: budget fetch failed: ${bErr.message}`);
  const budgets = (budgetRows ?? []).map((r) => ({
    category: r.category as Category,
    monthlyCapCents: r.monthly_cap_cents as number,
  }));

  // Posted spend for current month (used by pending-interception baseline).
  const monthStart = todayISO.slice(0, 8) + "01";
  const postedSpentByCategory: Partial<Record<Category, number>> = {};
  for (const t of txns) {
    if (t.transactionDate < monthStart || t.transactionDate > todayISO) continue;
    if (t.isTransfer || t.pending) continue;
    if (t.amountCents >= 0) continue;
    if (!t.category || t.category === "income" || t.category === "transfer") continue;
    postedSpentByCategory[t.category] =
      (postedSpentByCategory[t.category] ?? 0) + Math.abs(t.amountCents);
  }

  // -- Run detectors --------------------------------------------------------
  const candidates: AlertCandidate[] = [
    ...detectTransactionAnomalies(txns, { todayISO }),
    ...detectRecurringPriceChanges(recurring, txns, { todayISO }),
    ...detectPendingInterceptions(txns, {
      todayISO,
      budgets,
      postedSpentByCategory,
    }),
    ...detectIncomeLateness(recurring, txns, { todayISO }),
  ];
  summary.generated = candidates.length;

  // -- Upsert by dedup_key --------------------------------------------------
  // We don't bulk-upsert because Supabase's onConflict doesn't let us
  // preserve a user's prior dismiss/snooze decision — those should stay
  // sticky across rescans. Per-candidate lookup → conditional update/insert.
  const dedupKeysSeen = new Set<string>();
  for (const c of candidates) {
    dedupKeysSeen.add(c.dedupKey);
    const { data: existing, error: lookupErr } = await supabase
      .from("alerts")
      .select("id, status")
      .eq("user_id", userId)
      .eq("dedup_key", c.dedupKey)
      .maybeSingle();
    if (lookupErr) throw new Error(`alerts scan: lookup failed: ${lookupErr.message}`);

    if (existing) {
      // Respect user's prior decision — don't reopen what they dismissed/snoozed.
      if (existing.status === "dismissed" || existing.status === "snoozed") continue;
      // Refresh content but flip back to open when re-firing.
      const { error: updErr } = await supabase
        .from("alerts")
        .update({
          severity: c.severity,
          title: c.title,
          body: c.body,
          source_transaction_id: c.sourceTransactionId ?? null,
          source_recurring_id: c.sourceRecurringId ?? null,
          metadata: c.metadata ?? null,
          status: "open",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (updErr) throw new Error(`alerts scan: update failed: ${updErr.message}`);
    } else {
      const { error: insErr } = await supabase.from("alerts").insert({
        user_id: userId,
        kind: c.kind,
        severity: c.severity,
        title: c.title,
        body: c.body,
        source_transaction_id: c.sourceTransactionId ?? null,
        source_recurring_id: c.sourceRecurringId ?? null,
        dedup_key: c.dedupKey,
        metadata: c.metadata ?? null,
        status: "open",
      });
      if (insErr) throw new Error(`alerts scan: insert failed: ${insErr.message}`);
      summary.inserted++;
    }
  }

  // -- Auto-resolve open alerts whose condition no longer fires -------------
  const { data: openRows, error: openErr } = await supabase
    .from("alerts")
    .select("id, dedup_key")
    .eq("user_id", userId)
    .eq("status", "open");
  if (openErr) throw new Error(`alerts scan: open fetch failed: ${openErr.message}`);
  const stale = (openRows ?? []).filter((r) => !dedupKeysSeen.has(r.dedup_key as string));
  if (stale.length > 0) {
    const ids = stale.map((r) => r.id as string);
    const { error: resErr } = await supabase
      .from("alerts")
      .update({ status: "resolved", updated_at: new Date().toISOString() })
      .in("id", ids);
    if (resErr) throw new Error(`alerts scan: resolve failed: ${resErr.message}`);
    summary.resolved = stale.length;
  }

  return summary;
}

function addDaysISO(iso: string, days: number): string {
  const ms =
    Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) +
    days * 86400000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
