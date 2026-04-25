import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncTransactionsForUser } from "@/lib/basiq/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily sync handler. Vercel Cron hits this; we authenticate via CRON_SECRET.
 * For each unique (app user, basiq user) pair, runs an incremental sync from
 * the last_synced_at watermark.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const { data: connections, error } = await admin
    .from("bank_connections")
    .select("user_id, basiq_user_id, last_synced_at")
    .eq("status", "active");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Group by user — each user is synced once even if they have multiple connections,
  // because syncTransactionsForUser pulls all of a Basiq user's transactions in one go.
  const byUser = new Map<string, { basiqUserId: string; since?: string }>();
  for (const c of connections ?? []) {
    const existing = byUser.get(c.user_id);
    const since = c.last_synced_at ? c.last_synced_at.slice(0, 10) : undefined;
    if (!existing) {
      byUser.set(c.user_id, { basiqUserId: c.basiq_user_id, since });
    } else if (since && existing.since && since < existing.since) {
      existing.since = since;
    }
  }

  const results: Array<{ userId: string; ok: boolean; pulled?: number; error?: string }> = [];
  for (const [userId, { basiqUserId, since }] of byUser) {
    try {
      const r = await syncTransactionsForUser(admin, userId, basiqUserId, { since });
      results.push({ userId, ok: true, pulled: r.pulled });
    } catch (e) {
      results.push({ userId, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ ok: true, results });
}
