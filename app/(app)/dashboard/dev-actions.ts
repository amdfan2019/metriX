"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildSeedTransactions } from "@/lib/dev/seed";
import { todaySydney } from "@/lib/budgets/calc";
import { generateAndPersistBriefing } from "@/lib/agent/briefing";

function assertDev() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Dev tools are disabled in production.");
  }
}

export type DevActionResult =
  | { ok: true; message: string }
  | { error: string };

/**
 * Seed mock transactions. Refuses to run when transactions already exist —
 * mixing seed rows (basiq_transaction_id IS NULL) with real Basiq data
 * silently inflates spend totals because the upsert dedupe key is the
 * Basiq id. User must wipe first to load fresh mock data.
 */
export async function seedTransactionsAction(): Promise<DevActionResult> {
  assertDev();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { count, error: countErr } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (countErr) return { error: `Could not check existing transactions: ${countErr.message}` };
  if ((count ?? 0) > 0) {
    return {
      error: `Refusing to seed — ${count} transaction${count === 1 ? "" : "s"} already exist. Click "Wipe all" first to load fresh mock data.`,
    };
  }

  const rows = buildSeedTransactions(user.id, todaySydney());
  const { error } = await supabase.from("transactions").insert(rows);
  if (error) return { error: `Seed failed: ${error.message}` };

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  return { ok: true, message: `Seeded ${rows.length} mock transactions.` };
}

export async function wipeTransactionsAction(): Promise<DevActionResult> {
  assertDev();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // RLS already scopes to the user, but the explicit filter satisfies postgrest's safety check.
  const { error, count } = await supabase
    .from("transactions")
    .delete({ count: "exact" })
    .eq("user_id", user.id);
  if (error) return { error: `Wipe failed: ${error.message}` };

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  if (count === 0) {
    return { ok: true, message: "Nothing to wipe — transactions table was already empty." };
  }
  return { ok: true, message: `Wiped ${count} transaction${count === 1 ? "" : "s"}.` };
}

export async function regenerateBriefingAction(): Promise<DevActionResult> {
  assertDev();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  try {
    await generateAndPersistBriefing(supabase, user.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Briefing generation failed." };
  }
  revalidatePath("/dashboard");
  return { ok: true, message: "Briefing regenerated." };
}
