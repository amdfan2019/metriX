import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only admin client using the service-role key. Bypasses RLS — use only
 * for cron handlers, webhooks, or other code paths where there's no user
 * session and we explicitly intend to act across users.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
