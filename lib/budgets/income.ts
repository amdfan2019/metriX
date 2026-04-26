import { createClient } from "@/lib/supabase/server";

/** Returns the user's monthly income in cents, or null if unset. */
export async function fetchMonthlyIncomeCents(): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_settings")
    .select("monthly_income_cents")
    .maybeSingle();
  if (error) throw new Error(`fetchMonthlyIncomeCents failed: ${error.message}`);
  if (!data) return null;
  return data.monthly_income_cents as number | null;
}
