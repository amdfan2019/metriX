import { createClient } from "@/lib/supabase/server";

export interface UserBudgetSettings {
  monthlyIncomeCents: number | null;
  monthlySavingsTargetCents: number | null;
}

/** Single round-trip fetch of both budget-relevant settings fields. */
export async function fetchUserBudgetSettings(): Promise<UserBudgetSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_settings")
    .select("monthly_income_cents, monthly_savings_target_cents")
    .maybeSingle();
  if (error) throw new Error(`fetchUserBudgetSettings failed: ${error.message}`);
  if (!data) return { monthlyIncomeCents: null, monthlySavingsTargetCents: null };
  return {
    monthlyIncomeCents: (data.monthly_income_cents as number | null) ?? null,
    monthlySavingsTargetCents: (data.monthly_savings_target_cents as number | null) ?? null,
  };
}

/** Convenience: just the income figure. */
export async function fetchMonthlyIncomeCents(): Promise<number | null> {
  const { monthlyIncomeCents } = await fetchUserBudgetSettings();
  return monthlyIncomeCents;
}
