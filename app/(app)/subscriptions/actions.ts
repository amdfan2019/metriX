"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  rescanRecurringForUser,
  defaultNextExpectedDate,
  linkManualSubscription,
  type ScanSummary,
} from "@/lib/recurring/scan";
import { todaySydney } from "@/lib/budgets/calc";
import { CADENCE_VALUES, CATEGORY_VALUES, type Cadence, type Category } from "@/lib/db/schema";

export type RescanState =
  | { ok: true; summary: ScanSummary }
  | { error: string }
  | undefined;

export async function rescanRecurring(
  _prev: RescanState,
  _formData: FormData,
): Promise<RescanState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  try {
    const summary = await rescanRecurringForUser(supabase, user.id, todaySydney());
    revalidatePath("/subscriptions");
    revalidatePath("/dashboard");
    return { ok: true, summary };
  } catch (e) {
    console.error("[rescanRecurring] failed:", e);
    return { error: e instanceof Error ? e.message : "Rescan failed." };
  }
}

export type AddSubscriptionState =
  | { ok: true; linked: number }
  | { error: string }
  | undefined;

export async function addSubscription(
  _prev: AddSubscriptionState,
  formData: FormData,
): Promise<AddSubscriptionState> {
  const merchantName = String(formData.get("merchantName") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const cadence = String(formData.get("cadence") ?? "");
  const amountStr = String(formData.get("amountDollars") ?? "").trim();
  const nextExpected = String(formData.get("nextExpectedDate") ?? "").trim();

  if (!merchantName) return { error: "Merchant name is required." };
  if (!CATEGORY_VALUES.includes(category as Category)) return { error: "Invalid category." };
  if (!CADENCE_VALUES.includes(cadence as Cadence)) return { error: "Invalid cadence." };

  const amount = Number(amountStr);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Amount must be a positive number." };
  const amountCents = Math.round(amount * 100);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const today = todaySydney();
  const nextExpectedDate =
    nextExpected && /^\d{4}-\d{2}-\d{2}$/.test(nextExpected)
      ? nextExpected
      : defaultNextExpectedDate(cadence as Cadence, today);

  const { data: inserted, error } = await supabase
    .from("recurring_expenses")
    .insert({
      user_id: user.id,
      merchant_name: merchantName,
      category: category as Category,
      cadence: cadence as Cadence,
      typical_amount_cents: amountCents,
      min_amount_cents: amountCents,
      max_amount_cents: amountCents,
      next_expected_date: nextExpectedDate,
      leg_count: 0,
      status: "active",
      source: "manual",
      ignored: false,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { error: `You already have a ${cadence} entry for "${merchantName}".` };
    }
    return { error: error.message };
  }

  // Auto-link any past transactions that match this subscription. Failures
  // here shouldn't fail the action — the sub itself is created, and the user
  // can hit Rescan to retry.
  let linked = 0;
  try {
    const { linkedTxnIds } = await linkManualSubscription(
      supabase,
      user.id,
      inserted!.id as string,
      today,
    );
    linked = linkedTxnIds.length;
  } catch (e) {
    console.error("[addSubscription] auto-link failed:", e);
  }

  revalidatePath("/subscriptions");
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  return { ok: true, linked };
}

/**
 * Toggle ignored. Detected series the user wants to suppress; manual entries
 * generally wouldn't be ignored (they'd just delete the row), but we allow it.
 */
export async function toggleIgnored(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const ignored = String(formData.get("ignored") ?? "false") === "true";
  if (!id) throw new Error("Missing id.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { error } = await supabase
    .from("recurring_expenses")
    .update({ ignored })
    .eq("id", id);
  if (error) throw new Error(`Update failed: ${error.message}`);

  revalidatePath("/subscriptions");
  revalidatePath("/dashboard");
}

export async function deleteSubscription(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing id.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  // Manual entries can be hard-deleted. Detected entries should be ignored
  // instead — deleting them lets the next scan re-create them. We block
  // delete on detected rows on the server side as a safety rail.
  const { data: existing, error: fetchErr } = await supabase
    .from("recurring_expenses")
    .select("source")
    .eq("id", id)
    .single();
  if (fetchErr) throw new Error(`Lookup failed: ${fetchErr.message}`);
  if (existing.source !== "manual") {
    throw new Error("Only manual subscriptions can be deleted. Use Ignore for detected ones.");
  }

  const { error } = await supabase.from("recurring_expenses").delete().eq("id", id);
  if (error) throw new Error(`Delete failed: ${error.message}`);

  revalidatePath("/subscriptions");
  revalidatePath("/dashboard");
}
