"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildSeedTransactions } from "@/lib/dev/seed";
import { todaySydney } from "@/lib/budgets/calc";

function assertDev() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Dev tools are disabled in production.");
  }
}

export async function seedTransactionsAction() {
  assertDev();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const rows = buildSeedTransactions(user.id, todaySydney());
  const { error } = await supabase.from("transactions").insert(rows);
  if (error) throw new Error(`Seed failed: ${error.message}`);

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
}

export async function wipeTransactionsAction() {
  assertDev();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  // RLS already scopes to the user, but the explicit filter satisfies postgrest's safety check.
  const { error } = await supabase.from("transactions").delete().eq("user_id", user.id);
  if (error) throw new Error(`Wipe failed: ${error.message}`);

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
}
