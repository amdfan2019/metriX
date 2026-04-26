import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todaySydney } from "@/lib/budgets/calc";
import {
  runAgentLoop,
  messagesToGeminiContents,
  type AgentEvent,
  type ToolCallRecord,
} from "@/lib/agent/loop";
import { fetchSessionMessages, getOrCreateLatestSession } from "@/lib/agent/messages";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/agent/chat
 *
 * Body: { message: string }
 *
 * Streams Server-Sent Events as the agent loop progresses. Each SSE event is
 * a line of JSON with the AgentEvent shape. The route also persists the
 * full exchange to chat_messages so a page reload reconstructs the thread.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { message?: unknown };
  try {
    body = (await request.json()) as { message?: unknown };
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return new Response("`message` is required", { status: 400 });

  const sessionId = await getOrCreateLatestSession();
  const today = todaySydney();
  const previous = await fetchSessionMessages(sessionId);

  // Persist the user message immediately (so a page reload mid-stream still
  // shows it).
  const { error: insertUserErr } = await supabase.from("chat_messages").insert({
    session_id: sessionId,
    user_id: user.id,
    role: "user",
    content: message,
  });
  if (insertUserErr) {
    return new Response(`Failed to persist message: ${insertUserErr.message}`, { status: 500 });
  }

  // Inject today's date into the user message so the agent grounds its answer
  // in the current Sydney date without us having to keep a system message in
  // the persisted history.
  const userMessageWithDate = `[Today: ${today}]\n\n${message}`;

  const history = messagesToGeminiContents(previous);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: AgentEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      // Buffer the assistant turns + tool exchanges so we can persist them
      // when the loop ends.
      const assistantTurns: { content: string; toolCalls: ToolCallRecord[] }[] = [];
      const toolExchanges: { name: string; result: unknown }[] = [];

      try {
        for await (const event of runAgentLoop({
          history,
          userMessage: userMessageWithDate,
          supabase,
          userId: user.id,
          todayISO: today,
        })) {
          send(event);
          if (event.type === "assistant-turn") {
            assistantTurns.push({ content: event.content, toolCalls: event.toolCalls });
          } else if (event.type === "tool-exchange") {
            toolExchanges.push({ name: event.name, result: event.result });
          }
        }
      } catch (e) {
        send({
          type: "error",
          message: e instanceof Error ? e.message : "Unknown error.",
        });
      } finally {
        // Persist assistant turns and tool exchanges. We persist in the order
        // they happened so the reconstructed conversation is faithful.
        try {
          // Re-run the loop sequence: each assistant turn followed by its
          // tool exchanges (if any). We can pair by iteration index because
          // every assistant turn that emitted toolCalls is followed by one
          // tool exchange per call before the next assistant turn.
          let toolCursor = 0;
          for (const turn of assistantTurns) {
            await supabase.from("chat_messages").insert({
              session_id: sessionId,
              user_id: user.id,
              role: "assistant",
              content: turn.content || null,
              tool_calls: turn.toolCalls.length > 0 ? turn.toolCalls : null,
            });
            for (let i = 0; i < turn.toolCalls.length; i++) {
              const ex = toolExchanges[toolCursor++];
              if (!ex) continue;
              await supabase.from("chat_messages").insert({
                session_id: sessionId,
                user_id: user.id,
                role: "tool",
                tool_name: ex.name,
                tool_response: ex.result,
              });
            }
          }
          await supabase
            .from("chat_sessions")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", sessionId);
        } catch (e) {
          console.error("[/api/agent/chat] persistence failed:", e);
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
