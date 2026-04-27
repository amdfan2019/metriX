import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlertKind, AlertSeverity } from "@/lib/db/schema";

export interface AgentAlertRow {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  body: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  warn: 1,
  info: 2,
};

/**
 * `get_alerts()` — open alerts surfaced by the proactive scan. Returned
 * sorted critical → info, then most-recent first within a severity. The
 * agent uses this to lead with the most consequential thing.
 */
export async function getAlerts(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ rows: AgentAlertRow[]; counts: Record<AlertSeverity, number> }> {
  const { data, error } = await supabase
    .from("alerts")
    .select("id, kind, severity, title, body, created_at, metadata")
    .eq("user_id", userId)
    .eq("status", "open");
  if (error) throw new Error(`get_alerts failed: ${error.message}`);

  const rows: AgentAlertRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as AlertKind,
    severity: r.severity as AlertSeverity,
    title: r.title as string,
    body: r.body as string,
    created_at: r.created_at as string,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
  }));

  rows.sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    return b.created_at.localeCompare(a.created_at);
  });

  const counts: Record<AlertSeverity, number> = { critical: 0, warn: 0, info: 0 };
  for (const r of rows) counts[r.severity]++;

  return { rows, counts };
}
