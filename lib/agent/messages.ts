import { createClient } from "@/lib/supabase/server";
import type { ToolCallRecord } from "./loop";

export interface ChatMessageRow {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string | null;
  toolCalls: ToolCallRecord[] | null;
  toolName: string | null;
  toolResponse: unknown;
  createdAt: string;
}

/** Returns the user's latest chat session id, creating one if none exists. */
export async function getOrCreateLatestSession(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: existing, error: exErr } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (exErr) throw new Error(`session fetch failed: ${exErr.message}`);
  if (existing) return existing.id as string;

  const { data: created, error: cErr } = await supabase
    .from("chat_sessions")
    .insert({ user_id: user.id })
    .select("id")
    .single();
  if (cErr) throw new Error(`session create failed: ${cErr.message}`);
  return created!.id as string;
}

export async function fetchSessionMessages(sessionId: string): Promise<ChatMessageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, session_id, role, content, tool_calls, tool_name, tool_response, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`messages fetch failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    sessionId: r.session_id as string,
    role: r.role as ChatMessageRow["role"],
    content: (r.content as string | null) ?? null,
    toolCalls: (r.tool_calls as ToolCallRecord[] | null) ?? null,
    toolName: (r.tool_name as string | null) ?? null,
    toolResponse: r.tool_response,
    createdAt: r.created_at as string,
  }));
}
