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

  const { error } = await supabase
    .from("budgets")
    .upsert(rows, { onConflict: "user_id,category" });
  if (error) return { error: error.message };

  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  return { ok: true };
}
