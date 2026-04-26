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

/**
 * Hard reset for dev iteration. Deletes both transactions and recurring
 * series so a fresh sync + rescan rebuilds from scratch.
 *
 * Kept: merchant_aliases (the learned canonicalisation cache — rebuilding
 * costs Gemini calls), accounts (re-synced from Basiq), settings, budgets,
 * chat history, briefings.
 */
export async function wipeTransactionsAction(): Promise<DevActionResult> {
  assertDev();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Order matters: transactions reference recurring_expenses via
  // recurring_expense_id (ON DELETE SET NULL), so we can delete in either
  // order without FK violations. Doing them in parallel for speed.
  const [
    { error: txnErr, count: txnCount },
    { error: recErr, count: recCount },
  ] = await Promise.all([
    supabase.from("transactions").delete({ count: "exact" }).eq("user_id", user.id),
    supabase.from("recurring_expenses").delete({ count: "exact" }).eq("user_id", user.id),
  ]);
  if (txnErr) return { error: `Wipe transactions failed: ${txnErr.message}` };
  if (recErr) return { error: `Wipe recurring failed: ${recErr.message}` };

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/subscriptions");

  if ((txnCount ?? 0) === 0 && (recCount ?? 0) === 0) {
    return { ok: true, message: "Nothing to wipe — already empty." };
  }
  const parts: string[] = [];
  if ((txnCount ?? 0) > 0) parts.push(`${txnCount} transaction${txnCount === 1 ? "" : "s"}`);
  if ((recCount ?? 0) > 0) parts.push(`${recCount} recurring series`);
  return { ok: true, message: `Wiped ${parts.join(" and ")}.` };
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
