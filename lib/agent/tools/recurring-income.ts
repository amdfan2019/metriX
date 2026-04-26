import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cadence } from "@/lib/db/schema";

const CADENCE_CENTER_DAYS: Record<Cadence, number> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
  yearly: 365,
};

export interface RecurringIncomeRow {
  merchant_name: string;
  cadence: Cadence;
  typical_amount_cents: number;
  monthly_equivalent_cents: number;
  next_expected_date: string;
  last_seen_date: string | null;
  leg_count: number;
  status: "active" | "inactive";
  confidence: number | null;
}

/**
 * `get_recurring_income()` — surfaces detected recurring income streams
 * (paychecks, regular freelance retainers, etc) plus a one-shot rollup of
 * monthly-equivalent income. Used when the agent needs to reason about whether
 * the user's "real" income matches what they told us at onboarding.
 */
export async function getRecurringIncome(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  total_monthly_equivalent_cents: number;
  rows: RecurringIncomeRow[];
}> {
  const { data, error } = await supabase
    .from("recurring_expenses")
    .select(
      "merchant_name, cadence, typical_amount_cents, next_expected_date, last_seen_date, leg_count, status, confidence",
    )
    .eq("user_id", userId)
    .eq("direction", "income")
    .eq("ignored", false)
    .order("status", { ascending: true })
    .order("next_expected_date", { ascending: true });
  if (error) throw new Error(`get_recurring_income failed: ${error.message}`);

  let total = 0;
  const rows: RecurringIncomeRow[] = (data ?? []).map((r) => {
    const cadence = r.cadence as Cadence;
    const typical = r.typical_amount_cents as number;
    const monthlyEquiv = Math.round((typical * 30) / CADENCE_CENTER_DAYS[cadence]);
    if (r.status === "active") total += monthlyEquiv;
    return {
      merchant_name: r.merchant_name as string,
      cadence,
      typical_amount_cents: typical,
      monthly_equivalent_cents: monthlyEquiv,
      next_expected_date: r.next_expected_date as string,
      last_seen_date: (r.last_seen_date as string | null) ?? null,
      leg_count: r.leg_count as number,
      status: r.status as "active" | "inactive",
      confidence: r.confidence != null ? Number(r.confidence) : null,
    };
  });

  return { total_monthly_equivalent_cents: total, rows };
}
