import { createClient } from "@/lib/supabase/server";
import type { Cadence, Category } from "@/lib/db/schema";

export interface RecurringRow {
  id: string;
  merchantName: string;
  category: Category;
  cadence: Cadence;
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
      "id, merchant_name, category, cadence, typical_amount_cents, min_amount_cents, max_amount_cents, first_seen_date, last_seen_date, next_expected_date, leg_count, status, source, ignored, confidence, notes",
    )
    .order("next_expected_date", { ascending: true });
  if (error) throw new Error(`fetchUserRecurring failed: ${error.message}`);
  return (data ?? []).map(rowToRecurring);
}

function rowToRecurring(r: Record<string, unknown>): RecurringRow {
  return {
    id: r.id as string,
    merchantName: r.merchant_name as string,
    category: r.category as Category,
    cadence: r.cadence as Cadence,
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
 * For Slice 6's `can_i_afford` and dashboard "expected committed spend left":
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
