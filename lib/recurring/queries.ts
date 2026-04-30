import { createClient } from "@/lib/supabase/server";
import type { Cadence, Category } from "@/lib/db/schema";

export type Direction = "expense" | "income";

export interface RecurringRow {
  id: string;
  merchantName: string;
  category: Category;
  cadence: Cadence;
  direction: Direction;
  typicalAmountCents: number;
  minAmountCents: number;
  maxAmountCents: number;
  firstSeenDate: string | null;
  lastSeenDate: string | null;
  nextExpectedDate: string;
  legCount: number;
  status: "active" | "inactive";
  source: "detected" | "manual";
  ignored: boolean;
  confidence: number | null;
  notes: string | null;
}

export async function fetchUserRecurring(): Promise<RecurringRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recurring_expenses")
    .select(
      "id, merchant_name, category, cadence, direction, typical_amount_cents, min_amount_cents, max_amount_cents, first_seen_date, last_seen_date, next_expected_date, leg_count, status, source, ignored, confidence, notes",
    )
    .order("next_expected_date", { ascending: true });
  if (error) throw new Error(`fetchUserRecurring failed: ${error.message}`);
  return (data ?? []).map(rowToRecurring);
}

/**
 * Cadence center days, used to project a recurring stream's amount onto a
 * monthly equivalent. Mirrors `CADENCE_WINDOWS` in `cadence.ts` but kept inline
 * to avoid importing the cadence module from query callers.
 */
const CADENCE_CENTER_DAYS: Record<Cadence, number> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
  yearly: 365,
};

/** Express any cadence as a per-month equivalent in cents. Approximate. */
export function monthlyEquivalentCents(row: { cadence: Cadence; typicalAmountCents: number }): number {
  const days = CADENCE_CENTER_DAYS[row.cadence];
  if (days <= 0) return row.typicalAmountCents;
  return Math.round((row.typicalAmountCents * 30) / days);
}

/**
 * Sum of monthly-equivalent amounts for active, non-ignored recurring income.
 * Used for "actual" income reconciliation against the user's estimated income.
 */
export async function actualMonthlyIncomeCents(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recurring_expenses")
    .select("cadence, typical_amount_cents")
    .eq("direction", "income")
    .eq("status", "active")
    .eq("ignored", false);
  if (error) throw new Error(`actualMonthlyIncomeCents failed: ${error.message}`);
  let total = 0;
  for (const r of data ?? []) {
    total += monthlyEquivalentCents({
      cadence: r.cadence as Cadence,
      typicalAmountCents: r.typical_amount_cents as number,
    });
  }
  return total;
}

export interface AdditionalIncomeRow {
  id: string;
  description: string;
  merchantName: string | null;
  amountCents: number;
  transactionDate: string;
}

/**
 * Income transactions in the last `days` that aren't part of any recurring
 * series — gifts, refunds, ad-hoc payments. Powers the "additional income" feed.
 */
export async function fetchAdditionalIncome(days = 60): Promise<AdditionalIncomeRow[]> {
  const supabase = await createClient();
  const since = isoDateNDaysAgo(days);
  const { data, error } = await supabase
    .from("transactions")
    .select("id, description, merchant_name, amount_cents, transaction_date, recurring_expense_id")
    .eq("category", "income")
    .gt("amount_cents", 0)
    .gte("transaction_date", since)
    .is("recurring_expense_id", null)
    .order("transaction_date", { ascending: false });
  if (error) throw new Error(`fetchAdditionalIncome failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    description: r.description as string,
    merchantName: (r.merchant_name as string | null) ?? null,
    amountCents: r.amount_cents as number,
    transactionDate: r.transaction_date as string,
  }));
}

function isoDateNDaysAgo(days: number): string {
  const ms = Date.now() - days * 86400000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function rowToRecurring(r: Record<string, unknown>): RecurringRow {
  return {
    id: r.id as string,
    merchantName: r.merchant_name as string,
    category: r.category as Category,
    cadence: r.cadence as Cadence,
    direction: ((r.direction as Direction | null) ?? "expense") as Direction,
    typicalAmountCents: r.typical_amount_cents as number,
    minAmountCents: r.min_amount_cents as number,
    maxAmountCents: r.max_amount_cents as number,
    firstSeenDate: (r.first_seen_date as string | null) ?? null,
    lastSeenDate: (r.last_seen_date as string | null) ?? null,
    nextExpectedDate: r.next_expected_date as string,
    legCount: r.leg_count as number,
    status: r.status as "active" | "inactive",
    source: r.source as "detected" | "manual",
    ignored: r.ignored as boolean,
    confidence: r.confidence != null ? Number(r.confidence) : null,
    notes: (r.notes as string | null) ?? null,
  };
}

/**
 * For the agent's `can_i_afford` tool and the dashboard "expected committed spend left":
 * sums typical amounts of active, non-ignored recurring series whose next
 * expected charge falls between today (exclusive) and end-of-month (inclusive).
 *
 * Returned as a positive magnitude per category. Inactive and ignored series
 * are skipped — we don't expect them to charge.
 */
export type CommittedRemaining = Partial<Record<Category, number>>;

export async function expectedRemainingThisMonthByCategory(
  todayISO: string,
): Promise<CommittedRemaining> {
  const supabase = await createClient();
  const monthEnd = endOfMonth(todayISO);

  const { data, error } = await supabase
    .from("recurring_expenses")
    .select("category, typical_amount_cents, next_expected_date, status, ignored")
    .eq("direction", "expense")
    .eq("status", "active")
    .eq("ignored", false)
    .gt("next_expected_date", todayISO)
    .lte("next_expected_date", monthEnd);
  if (error) throw new Error(`expectedRemainingThisMonth failed: ${error.message}`);

  const out: CommittedRemaining = {};
  for (const r of data ?? []) {
    const cat = r.category as Category;
    const amount = r.typical_amount_cents as number;
    out[cat] = (out[cat] ?? 0) + amount;
  }
  return out;
}

function endOfMonth(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
}
