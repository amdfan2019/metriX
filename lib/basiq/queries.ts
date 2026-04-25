import { createClient } from "@/lib/supabase/server";

export interface BankConnectionRow {
  id: string;
  basiqConnectionId: string;
  institutionName: string | null;
  status: string;
  lastSyncedAt: string | null;
  createdAt: string;
}

export async function fetchUserConnections(): Promise<BankConnectionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_connections")
    .select("id, basiq_connection_id, institution_name, status, last_synced_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`fetchUserConnections failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    basiqConnectionId: r.basiq_connection_id as string,
    institutionName: r.institution_name as string | null,
    status: r.status as string,
    lastSyncedAt: r.last_synced_at as string | null,
    createdAt: r.created_at as string,
  }));
}
