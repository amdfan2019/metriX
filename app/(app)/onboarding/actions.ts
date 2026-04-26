"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listSpendingCategories } from "@/lib/budgets/calc";
import { suggestBudgets } from "@/lib/budgets/suggest";
import { CATEGORY_VALUES, type Category } from "@/lib/db/schema";

export type OnboardingState =
  | { ok: true }
  | { error: string }
  | undefined;

/**
 * Single-shot onboarding submission. Persists income + savings target +
 * per-category budget caps in one request, then redirects the user to the
 * dashboard.
 */
export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const incomeRaw = String(formData.get("incomeDollars") ?? "").trim();
  const savingsRaw = String(formData.get("savingsDollars") ?? "").trim();

  const income = Number(incomeRaw);
  if (!Number.isFinite(income) || income <= 0) {
    return { error: "Enter your monthly income." };
  }
  const savings = savingsRaw === "" ? 0 : Number(savingsRaw);
  if (!Number.isFinite(savings) || savings < 0) {
    return { error: "Savings target must be zero or positive." };
  }
  if (savings > income) {
    return { error: "Savings target can't exceed income." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Save settings.
  const incomeCents = Math.round(income * 100);
  const savingsCents = Math.round(savings * 100);
  const { error: settingsErr } = await supabase
    .from("user_settings")
    .upsert(
      {
        user_id: user.id,
        monthly_income_cents: incomeCents,
        monthly_savings_target_cents: savingsCents,
      },
      { onConflict: "user_id" },
    );
  if (settingsErr) return { error: settingsErr.message };

  // Save budgets — pull from the form, falling back to engine suggestions for
  // anything the user didn't override.
  const suggestion = suggestBudgets(incomeCents, savingsCents);
  const suggestedByCategory = new Map(suggestion.rows.map((r) => [r.category, r.cents]));

  const rows = listSpendingCategories()
    .map((category) => {
      const fromForm = formData.get(category);
      const fromFormDollars =
        fromForm == null || fromForm === "" ? null : Number(fromForm);
      const cents =
        fromFormDollars != null && Number.isFinite(fromFormDollars) && fromFormDollars >= 0
          ? Math.round(fromFormDollars * 100)
          : (suggestedByCategory.get(category) ?? 0);
      return { user_id: user.id, category, monthly_cap_cents: cents };
    })
    .filter((r) => r.monthly_cap_cents > 0);

  if (rows.length > 0) {
    const { error: budgetsErr } = await supabase
      .from("budgets")
      .upsert(rows, { onConflict: "user_id,category" });
    if (budgetsErr) return { error: budgetsErr.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/budgets");
  revalidatePath("/settings");
  redirect("/dashboard");
}

// Exported for use in tests / future callers wanting just the suggested map.
export type { Category };
export { CATEGORY_VALUES };
