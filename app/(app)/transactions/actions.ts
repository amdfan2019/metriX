"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTransactions, type ResolveSummary } from "@/lib/merchants/resolver";
import type { Category } from "@/lib/db/schema";
import { CATEGORY_VALUES } from "@/lib/db/schema";

export type RunCategorisationState =
  | { ok: true; summary: ResolveSummary }
  | { error: string }
  | undefined;

export async function runCategorisation(
  _prev: RunCategorisationState,
  _formData: FormData,
): Promise<RunCategorisationState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  try {
    const summary = await resolveUserTransactions(supabase, user.id);
    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    return { ok: true, summary };
  } catch (e) {
    // Log full detail to server stdout so we can diagnose; return concise to client.
    console.error("[runCategorisation] failed:", e);
    if (e instanceof Error && "cause" in e) {
      console.error("[runCategorisation] cause:", (e as Error & { cause?: unknown }).cause);
    }
    const message = e instanceof Error ? `${e.name}: ${e.message}` : "Categorisation failed.";
    return { error: message };
  }
}

/**
 * User confirms the resolver's suggestion (the row's existing merchant_name +
 * category). Persists an alias with source=user, applies the resolution to all
 * sibling transactions sharing the same raw_description, clears needs_review.
 */
export async function confirmReview(formData: FormData) {
  const txnId = String(formData.get("txnId") ?? "");
  if (!txnId) throw new Error("Missing txnId.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: txn, error: getErr } = await supabase
    .from("transactions")
    .select("description, merchant_name, category, confidence")
    .eq("id", txnId)
    .single();
  if (getErr) throw new Error(`Lookup failed: ${getErr.message}`);
  if (!txn.category || !txn.merchant_name) throw new Error("Transaction has no suggestion to confirm.");

  await persistAliasAndCascade(supabase, user.id, {
    rawDescription: txn.description as string,
    merchantName: txn.merchant_name as string,
    category: txn.category as Category,
    confidence: txn.confidence ? Number(txn.confidence) : 1.0,
  });

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}

/**
 * User overrides the resolver's category (and optionally merchant name). Same
 * cascade as confirm — alias persisted, all sibling txns updated.
 */
export async function correctReview(formData: FormData) {
  const txnId = String(formData.get("txnId") ?? "");
  const category = String(formData.get("category") ?? "");
  const merchantName = String(formData.get("merchantName") ?? "").trim();

  if (!txnId) throw new Error("Missing txnId.");
  if (!CATEGORY_VALUES.includes(category as Category)) {
    throw new Error(`Invalid category: ${category}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: txn, error: getErr } = await supabase
    .from("transactions")
    .select("description, merchant_name")
    .eq("id", txnId)
    .single();
  if (getErr) throw new Error(`Lookup failed: ${getErr.message}`);

  const finalMerchantName = merchantName || (txn.merchant_name as string | null) || (txn.description as string);

  await persistAliasAndCascade(supabase, user.id, {
    rawDescription: txn.description as string,
    merchantName: finalMerchantName,
    category: category as Category,
    confidence: 1.0,
  });

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}

interface AliasUpdate {
  rawDescription: string;
  merchantName: string;
  category: Category;
  confidence: number;
}

async function persistAliasAndCascade(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  alias: AliasUpdate,
): Promise<void> {
  // Upsert with source=user — overrides any prior gemini-sourced alias for this raw_description.
  const { error: aliasErr } = await supabase.from("merchant_aliases").upsert(
    {
      user_id: userId,
      raw_description: alias.rawDescription,
      merchant_name: alias.merchantName,
      category: alias.category,
      source: "user",
      confidence: alias.confidence,
    },
    { onConflict: "user_id,raw_description" },
  );
  if (aliasErr) throw new Error(`Alias upsert failed: ${aliasErr.message}`);

  // Cascade: every transaction with the same raw_description gets the same resolution
  // and clears needs_review. Confidence rises to 1.0 because the user has now confirmed.
  const { error: txnErr } = await supabase
    .from("transactions")
    .update({
      merchant_name: alias.merchantName,
      category: alias.category,
      confidence: alias.confidence,
      needs_review: false,
    })
    .eq("user_id", userId)
    .eq("description", alias.rawDescription);
  if (txnErr) throw new Error(`Cascade update failed: ${txnErr.message}`);
}
