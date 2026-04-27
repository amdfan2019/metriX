"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type DismissResult = { ok: true } | { error: string };

export async function dismissAlert(alertId: string): Promise<DismissResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("alerts")
    .update({ status: "dismissed", updated_at: new Date().toISOString() })
    .eq("id", alertId)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}
