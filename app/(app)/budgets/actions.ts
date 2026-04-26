"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listSpendingCategories } from "@/lib/budgets/calc";

export type SaveBudgetsState = { ok: true } | { error: string } | undefined;

export async function saveBudgets(
  _prev: SaveBudgetsState,
  formData: FormData,
): Promise<SaveBudgetsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const rows = listSpendingCategories()
    .map((category) => {
      const raw = formData.get(category);
      const dollars = raw == null || raw === "" ? NaN : Number(raw);
      const cents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
      return { user_id: user.id, category, monthly_cap_cents: cents };
    })
    .filter((r) => r.monthly_cap_cents > 0);

  if (rows.length === 0) return { error: "Set at least one budget cap." };

  // Read income + parse savings input. Savings is part of the same form here,
  // since (savings + category caps) needs to add up to income coherently.
  const { data: settings, error: settingsErr } = await supabase
    .from("user_settings")
    .select("monthly_income_cents")
    .eq("user_id", user.id)
    .maybeSingle();
  if (settingsErr) return { error: `Could not check income: ${settingsErr.message}` };
  const incomeCents = (settings?.monthly_income_cents as number | null) ?? null;

  const savingsRaw = formData.get("savingsTarget");
  const savingsDollars = savingsRaw == null || savingsRaw === "" ? 0 : Number(savingsRaw);
  if (!Number.isFinite(savingsDollars) || savingsDollars < 0) {
    return { error: "Savings target must be a non-negative number." };
  }
  const savingsCents = Math.round(savingsDollars * 100);

  // Hard guard: savings + category caps cannot exceed monthly income.
  if (incomeCents != null && incomeCents > 0) {
    const capsCents = rows.reduce((sum, r) => sum + r.monthly_cap_cents, 0);
    const totalCents = capsCents + savingsCents;
    if (totalCents > incomeCents) {
      const totalD = (totalCents / 100).toFixed(0);
      const incomeD = (incomeCents / 100).toFixed(0);
      return {
        error: `Allocation totals $${totalD} but income is $${incomeD}. Trim either savings or a category — the math has to balance.`,
      };
    }
  }

  // Persist budgets and savings target together. We can't run them in a
  // single transaction with supabase-js, but failures roll back at the
  // statement level — worst case the form shows the error and the user retries.
  const { error: budgetsErr } = await supabase
    .from("budgets")
    .upsert(rows, { onConflict: "user_id,category" });
  if (budgetsErr) return { error: budgetsErr.message };

  if (incomeCents != null) {
    const { error: savingsErr } = await supabase
      .from("user_settings")
      .upsert(
        { user_id: user.id, monthly_savings_target_cents: savingsCents },
        { onConflict: "user_id" },
      );
    if (savingsErr) return { error: `Saved budgets but savings target failed: ${savingsErr.message}` };
  }

  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  revalidatePath("/settings");
  return { ok: true };
}
