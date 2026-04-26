"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { basiq } from "@/lib/basiq/client";
import { syncTransactionsForUser } from "@/lib/basiq/sync";

export type SaveMobileState = { ok: true } | { error: string } | undefined;
export type SaveIncomeState = { ok: true } | { error: string } | undefined;

/**
 * Stores monthly income in user_settings. Drives the on-track widget on the
 * dashboard and the agent's `get_overall_health` tool.
 */
export async function saveMonthlyIncome(
  _prev: SaveIncomeState,
  formData: FormData,
): Promise<SaveIncomeState> {
  const raw = String(formData.get("incomeDollars") ?? "").trim();
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "Income must be a positive number." };
  }
  const cents = Math.round(amount * 100);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, monthly_income_cents: cents }, { onConflict: "user_id" });
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Saves the user's mobile to user_metadata. Basiq requires a mobile for SMS
 * consent verification on the auth_link, so this needs to be set before
 * Connect works for real users.
 */
export async function saveMobile(
  _prev: SaveMobileState,
  formData: FormData,
): Promise<SaveMobileState> {
  const raw = String(formData.get("mobile") ?? "").trim();
  // Accept loose AU formats: with/without spaces, +61 prefix, leading 0.
  const digits = raw.replace(/\D/g, "");
  let normalised: string | null = null;
  if (digits.startsWith("614") && digits.length === 11) normalised = `+${digits}`;
  else if (digits.startsWith("04") && digits.length === 10) normalised = `+61${digits.slice(1)}`;
  else if (digits.startsWith("4") && digits.length === 9) normalised = `+61${digits}`;

  if (!normalised) {
    return { error: "Enter a valid AU mobile, e.g. 0412 345 678 or +61412345678." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { mobile: normalised } });
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

export async function startBankConnection() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  if (!user.email) throw new Error("Account is missing an email address.");

  let basiqUserId = user.user_metadata?.basiq_user_id as string | undefined;
  // Basiq requires a mobile for SMS consent verification. We accept either an
  // explicit user-set value (user_metadata.mobile, populated via the settings
  // form once we build it) or fall back to a sandbox stub. In production this
  // becomes a hard requirement we collect at signup.
  const mobile =
    (user.user_metadata?.mobile as string | undefined) ?? "+61400000000";

  if (!basiqUserId) {
    const created = await basiq.createUser(user.email, mobile);
    basiqUserId = created.id;
    const { error } = await supabase.auth.updateUser({
      data: { basiq_user_id: basiqUserId },
    });
    if (error) throw new Error(`Failed to persist Basiq user id: ${error.message}`);
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = await basiq.createAuthLink(basiqUserId, {
    successUrl: `${origin}/api/basiq/callback`,
    errorUrl: `${origin}/settings?error=basiq-cancelled`,
    mobile,
  });
  redirect(link.links.public);
}

export async function manualSync() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const basiqUserId = user.user_metadata?.basiq_user_id as string | undefined;
  if (!basiqUserId) throw new Error("No Basiq user id — connect a bank first.");

  await syncTransactionsForUser(supabase, user.id, basiqUserId);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
}

/**
 * Reconciles bank_connections with whatever Basiq has on file for this user,
 * then syncs transactions. Useful when Basiq's Consent UI doesn't auto-redirect
 * back to our /api/basiq/callback (some sandbox tiers don't honour the redirect).
 */
export async function pullFromBasiq() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const basiqUserId = user.user_metadata?.basiq_user_id as string | undefined;
  if (!basiqUserId) throw new Error("No Basiq user id — start a connection first.");

  const connections = await basiq.listConnections(basiqUserId);
  for (const conn of connections) {
    let institutionName: string | null = null;
    if (conn.institution?.id) {
      try {
        const inst = await basiq.getInstitution(conn.institution.id);
        institutionName = inst.name ?? null;
      } catch {
        // non-fatal
      }
    }
    const { error } = await supabase.from("bank_connections").upsert(
      {
        user_id: user.id,
        basiq_user_id: basiqUserId,
        basiq_connection_id: conn.id,
        institution_name: institutionName,
        status: conn.status ?? "active",
      },
      { onConflict: "user_id,basiq_connection_id" },
    );
    if (error) throw new Error(`Failed to upsert connection: ${error.message}`);
  }

  await syncTransactionsForUser(supabase, user.id, basiqUserId);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
}
