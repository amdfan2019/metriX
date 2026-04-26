"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Send, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatMessageRow } from "@/lib/agent/messages";
import type { ToolCallRecord } from "@/lib/agent/loop";

interface ChatThreadProps {
  initialMessages: ChatMessageRow[];
  isDev: boolean;
}

// Visible message types for the UI. Tool rows from the DB get folded into the
// preceding assistant turn — the UI shows tools as part of the assistant's
// "thinking", not as standalone bubbles.
interface UiAssistantTurn {
  kind: "assistant";
  content: string;
  toolCalls: ToolCallRecord[];
  toolResults: { name: string; result: unknown }[];
}
interface UiUserTurn {
  kind: "user";
  content: string;
}
type UiTurn = UiAssistantTurn | UiUserTurn;

function rowsToUiTurns(rows: ChatMessageRow[]): UiTurn[] {
  const turns: UiTurn[] = [];
  let pendingAssistant: UiAssistantTurn | null = null;
  for (const r of rows) {
    if (r.role === "user") {
      if (pendingAssistant) {
        turns.push(pendingAssistant);
        pendingAssistant = null;
      }
      turns.push({ kind: "user", content: r.content ?? "" });
    } else if (r.role === "assistant") {
      if (pendingAssistant) turns.push(pendingAssistant);
      pendingAssistant = {
        kind: "assistant",
        content: r.content ?? "",
        toolCalls: r.toolCalls ?? [],
        toolResults: [],
      };
    } else if (r.role === "tool" && pendingAssistant) {
      pendingAssistant.toolResults.push({
        name: r.toolName ?? "unknown",
        result: r.toolResponse,
      });
    }
  }
  if (pendingAssistant) turns.push(pendingAssistant);
  return turns;
}

export function ChatThread({ initialMessages, isDev }: ChatThreadProps) {
  const [turns, setTurns] = useState<UiTurn[]>(() => rowsToUiTurns(initialMessages));
  const [pending, setPending] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever turns change (and on mount).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns]);

  const sendMessage = async (message: string) => {
    if (!message.trim() || pending) return;
    setPending(true);
    setInput("");

    // Optimistic user bubble + a placeholder assistant turn we'll append to as
    // events stream in.
    setTurns((t) => [
      ...t,
      { kind: "user", content: message },
      { kind: "assistant", content: "", toolCalls: [], toolResults: [] },
    ]);

    let response: Response;
    try {
      response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error.");
      setPending(false);
      return;
    }
    if (!response.ok || !response.body) {
      toast.error(`Agent failed: ${response.status} ${response.statusText}`);
      setPending(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE frames are separated by blank lines.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const json = dataLine.slice(5).trim();
          if (!json) continue;
          let event;
          try {
            event = JSON.parse(json);
          } catch {
            continue;
          }
          applyEvent(setTurns, event);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Stream interrupted.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto rounded-md border bg-card/30 p-4 space-y-4"
      >
        {turns.length === 0 && (
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Try one of these:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>How am I doing this month?</li>
              <li>Can I afford $200 on dinners tonight?</li>
              <li>What did I spend on groceries this month?</li>
              <li>Is my dining trending up?</li>
            </ul>
          </div>
        )}
        {turns.map((turn, i) => (
          <TurnBubble key={i} turn={turn} isDev={isDev} />
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything…"
          disabled={pending}
          className="flex-1 h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        />
        <Button type="submit" disabled={pending || !input.trim()} className="gap-1.5">
          <Send className="size-3.5" aria-hidden />
          {pending ? "Thinking…" : "Send"}
        </Button>
      </form>
    </>
  );
}

function TurnBubble({ turn, isDev }: { turn: UiTurn; isDev: boolean }) {
  if (turn.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-foreground px-4 py-2 text-sm text-background">
          {turn.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 items-start">
      {turn.content && (
        <div className="max-w-[85%] rounded-2xl border bg-background px-4 py-2 text-sm whitespace-pre-wrap">
          {turn.content}
        </div>
      )}
      {!turn.content && turn.toolCalls.length === 0 && (
        <div className="max-w-[85%] rounded-2xl border bg-background px-4 py-2 text-sm text-muted-foreground italic">
          …
        </div>
      )}
      {isDev && turn.toolCalls.length > 0 && (
        <DebugPanel toolCalls={turn.toolCalls} toolResults={turn.toolResults} />
      )}
    </div>
  );
}

function DebugPanel({
  toolCalls,
  toolResults,
}: {
  toolCalls: ToolCallRecord[];
  toolResults: { name: string; result: unknown }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="max-w-[85%] rounded-md border border-dashed bg-muted/30 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <Wrench className="size-3" aria-hidden />
        <span>
          {toolCalls.length} tool call{toolCalls.length === 1 ? "" : "s"} · dev only
        </span>
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          {toolCalls.map((tc, i) => (
            <div key={i} className="space-y-1 rounded border bg-background p-2 font-mono">
              <div className="font-semibold">{tc.name}</div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[10px]">
                {JSON.stringify(tc.args, null, 2)}
              </pre>
              {toolResults[i] && (
                <>
                  <div className="text-muted-foreground">↳ result</div>
                  <pre
                    className={cn(
                      "overflow-x-auto whitespace-pre-wrap break-all text-[10px] max-h-48 overflow-y-auto",
                    )}
                  >
                    {JSON.stringify(toolResults[i].result, null, 2)}
                  </pre>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type AgentEventClient =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; name: string; args: Record<string, unknown> }
  | { type: "tool-result"; name: string; result: unknown }
  | { type: "assistant-turn"; content: string; toolCalls: ToolCallRecord[] }
  | { type: "tool-exchange"; name: string; args: Record<string, unknown>; result: unknown }
  | { type: "turn-complete" }
  | { type: "error"; message: string };

function applyEvent(
  setTurns: React.Dispatch<React.SetStateAction<UiTurn[]>>,
  event: AgentEventClient,
) {
  if (event.type === "text-delta") {
    setTurns((turns) => {
      // Append to the last assistant turn — there must be one because we
      // pushed a placeholder when the user sent the message. If the model is
      // emitting text in step 2+ of a multi-turn loop, there's already a
      // refreshed assistant placeholder for that step.
      const out = [...turns];
      const last = out[out.length - 1];
      if (last && last.kind === "assistant") {
        out[out.length - 1] = { ...last, content: last.content + event.text };
      }
      return out;
    });
  } else if (event.type === "tool-call") {
    setTurns((turns) => {
      const out = [...turns];
      const last = out[out.length - 1];
      if (last && last.kind === "assistant") {
        out[out.length - 1] = {
          ...last,
          toolCalls: [...last.toolCalls, { name: event.name, args: event.args }],
        };
      }
      return out;
    });
  } else if (event.type === "tool-result") {
    setTurns((turns) => {
      const out = [...turns];
      const last = out[out.length - 1];
      if (last && last.kind === "assistant") {
        out[out.length - 1] = {
          ...last,
          toolResults: [...last.toolResults, { name: event.name, result: event.result }],
        };
      }
      return out;
    });
  } else if (event.type === "assistant-turn") {
    // If the model is going to call tools and then come back, start a fresh
    // placeholder for the next assistant turn so subsequent text deltas don't
    // pile onto the just-finished one.
    if (event.toolCalls.length > 0) {
      setTurns((turns) => [
        ...turns,
        { kind: "assistant", content: "", toolCalls: [], toolResults: [] },
      ]);
    }
  } else if (event.type === "error") {
    toast.error(event.message);
  }
  // tool-exchange and turn-complete: nothing to render — text-delta and
  // tool-call/tool-result already covered them.
}
