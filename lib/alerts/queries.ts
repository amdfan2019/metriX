import { createClient } from "@/lib/supabase/server";
import type { AlertKind, AlertSeverity, AlertStatus } from "@/lib/db/schema";

export interface AlertRow {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  body: string;
  sourceTransactionId: string | null;
  sourceRecurringId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  warn: 1,
  info: 2,
};

/**
 * Open alerts for the signed-in user, sorted by severity descending then
 * recency. The /dashboard renders these as dismissible cards; the agent's
 * `get_alerts` tool reads them too.
 */
export async function fetchOpenAlerts(): Promise<AlertRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alerts")
    .select(
      "id, kind, severity, status, title, body, source_transaction_id, source_recurring_id, metadata, created_at, updated_at",
    )
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`fetchOpenAlerts failed: ${error.message}`);

  const rows: AlertRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as AlertKind,
    severity: r.severity as AlertSeverity,
    status: r.status as AlertStatus,
    title: r.title as string,
    body: r.body as string,
    sourceTransactionId: (r.source_transaction_id as string | null) ?? null,
    sourceRecurringId: (r.source_recurring_id as string | null) ?? null,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));

  return rows.sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    return b.createdAt.localeCompare(a.createdAt);
  });
}
