"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { basiq } from "@/lib/basiq/client";
import { syncTransactionsForUser } from "@/lib/basiq/sync";

export async function startBankConnection() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  if (!user.email) throw new Error("Account is missing an email address.");

  let basiqUserId = user.user_metadata?.basiq_user_id as string | undefined;

  if (!basiqUserId) {
    const created = await basiq.createUser(user.email);
    basiqUserId = created.id;
    const { error } = await supabase.auth.updateUser({
      data: { basiq_user_id: basiqUserId },
    });
    if (error) throw new Error(`Failed to persist Basiq user id: ${error.message}`);
  }

  const link = await basiq.createAuthLink(basiqUserId);
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
