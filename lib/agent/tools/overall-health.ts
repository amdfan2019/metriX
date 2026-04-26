import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeOverallHealth,
  type OverallStatus,
  type SavingsStatus,
} from "@/lib/budgets/overall";
import type { CalcTransaction } from "@/lib/budgets/calc";
import type { Cadence } from "@/lib/db/schema";
import { CATEGORY_VALUES, type Category } from "@/lib/db/schema";

const CADENCE_CENTER_DAYS: Record<Cadence, number> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
  yearly: 365,
};

export interface OverallHealthResult {
  status: OverallStatus;
  monthly_income_cents: number | null;
  /** Sum of monthly-equivalent active recurring income — the system's "actual" estimate. */
  detected_monthly_income_cents: number;
  /** Difference between user-entered estimate and detected actual, in cents. Positive = detected exceeds estimate. */
  income_drift_cents: number | null;
  monthly_savings_target_cents: number | null;
  savings_progress_cents: number | null;
  savings_status: SavingsStatus;
  spent_cents: number;
  upcoming_committed_cents: number;
  flexible_remaining_cents: number;
  days_remaining: number;
  per_day_cents: number;
  /** Per-category committed-remaining for the rest of the month. */
  upcoming_by_category: Record<string, number>;
}

/**
 * `get_overall_health()` — the user's "are we on track this month?" answer in
 * one tool call. Combines income, current spend, and upcoming recurring
 * commitments. Backs the dashboard widget too, so the model and the UI agree
 * on the same numbers.
 */
export async function getOverallHealth(
  supabase: SupabaseClient,
  userId: string,
  _args: Record<string, unknown>,
  todayISO: string,
): Promise<OverallHealthResult> {
  const monthStart = todayISO.slice(0, 8) + "01";
  const monthEnd = endOfMonth(todayISO);

  const [
    { data: settingsData, error: sErr },
    { data: txData, error: tErr },
    { data: recurringData, error: rErr },
    { data: incomeSeriesData, error: iErr },
  ] = await Promise.all([
    supabase
      .from("user_settings")
      .select("monthly_income_cents, monthly_savings_target_cents")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("transactions")
      .select("category, amount_cents, transaction_date")
      .eq("user_id", userId)
      .gte("transaction_date", monthStart)
      .lte("transaction_date", todayISO),
    supabase
      .from("recurring_expenses")
      .select("category, typical_amount_cents, next_expected_date")
      .eq("user_id", userId)
      .eq("direction", "expense")
      .eq("status", "active")
      .eq("ignored", false)
      .gt("next_expected_date", todayISO)
      .lte("next_expected_date", monthEnd),
    supabase
      .from("recurring_expenses")
      .select("cadence, typical_amount_cents")
      .eq("user_id", userId)
      .eq("direction", "income")
      .eq("status", "active")
      .eq("ignored", false),
  ]);
  if (sErr) throw new Error(`get_overall_health: settings fetch failed: ${sErr.message}`);
  if (tErr) throw new Error(`get_overall_health: txns fetch failed: ${tErr.message}`);
  if (rErr) throw new Error(`get_overall_health: recurring fetch failed: ${rErr.message}`);
  if (iErr) throw new Error(`get_overall_health: income fetch failed: ${iErr.message}`);

  const monthlyIncomeCents = (settingsData?.monthly_income_cents as number | null) ?? null;
  const monthlySavingsTargetCents =
    (settingsData?.monthly_savings_target_cents as number | null) ?? null;

  const txns: CalcTransaction[] = (txData ?? []).map((r) => ({
    category: r.category as Category | null,
    amountCents: r.amount_cents as number,
    transactionDate: r.transaction_date as string,
  }));

  const upcomingByCategory: Partial<Record<Category, number>> = {};
  for (const c of CATEGORY_VALUES) upcomingByCategory[c] = 0;
  for (const r of recurringData ?? []) {
    const cat = r.category as Category;
    upcomingByCategory[cat] = (upcomingByCategory[cat] ?? 0) + (r.typical_amount_cents as number);
  }

  // Detected actual monthly income — sum of recurring income series, projected
  // to a monthly equivalent using cadence center days.
  let detectedMonthlyIncomeCents = 0;
  for (const r of incomeSeriesData ?? []) {
    const cadence = r.cadence as Cadence;
    const days = CADENCE_CENTER_DAYS[cadence] ?? 30;
    detectedMonthlyIncomeCents += Math.round(((r.typical_amount_cents as number) * 30) / days);
  }
  const incomeDriftCents =
    monthlyIncomeCents != null
      ? detectedMonthlyIncomeCents - monthlyIncomeCents
      : null;

  const health = computeOverallHealth({
    monthlyIncomeCents,
    monthlySavingsTargetCents,
    monthTransactions: txns,
    committedRemaining: upcomingByCategory,
    todayISO,
  });

  return {
    status: health.status,
    monthly_income_cents: monthlyIncomeCents,
    detected_monthly_income_cents: detectedMonthlyIncomeCents,
    income_drift_cents: incomeDriftCents,
    monthly_savings_target_cents: monthlySavingsTargetCents,
    savings_progress_cents: health.savingsProgressCents,
    savings_status: health.savingsStatus,
    spent_cents: health.spentCents,
    upcoming_committed_cents: health.committedCents,
    flexible_remaining_cents: health.flexibleRemainingCents,
    days_remaining: health.daysRemaining,
    per_day_cents: health.perDayCents,
    upcoming_by_category: upcomingByCategory as Record<string, number>,
  };
}

function endOfMonth(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
}
