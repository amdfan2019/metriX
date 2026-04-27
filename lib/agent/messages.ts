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

/**
 * Wipe every prior chat session (and its messages, via FK cascade) for the
 * user, then create a fresh empty one. This is what /chat calls on page load
 * — refreshing the page resets the chat thread back to zero, by design.
 *
 * Differs from getOrCreateLatestSession (which is what the /api/agent/chat
 * route calls per-message): that one continues the existing active session
 * mid-conversation, this one starts a brand new one.
 */
export async function resetAndCreateChatSession(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  // Cascade deletes chat_messages via the FK declared in the schema.
  const { error: delErr } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("user_id", user.id);
  if (delErr) throw new Error(`chat reset failed: ${delErr.message}`);

  const { data: created, error: cErr } = await supabase
    .from("chat_sessions")
    .insert({ user_id: user.id })
    .select("id")
    .single();
  if (cErr) throw new Error(`chat session create failed: ${cErr.message}`);
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
