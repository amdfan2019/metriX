import type { Content, Part } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { geminiClient, GEMINI_MODEL } from "@/lib/gemini/client";
import { TOOL_DECLARATIONS } from "./declarations";
import { AGENT_SYSTEM_PROMPT } from "./system-prompt";
import { executeTool } from "./tools";

/** Cap on tool round-trips per user message — safety rail against runaway loops. */
export const MAX_TOOL_ROUNDTRIPS = 5;

/**
 * One function call emitted by the model.
 *
 * `thoughtSignature` is required by Gemini 3 thinking models — when we send
 * the model's prior turn back in the next request, every function-call part
 * must carry its original signature or the API rejects the request with
 * "Function call is missing a thought_signature". We capture it from the
 * streamed Part and echo it back in `assistantParts`.
 */
export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  thoughtSignature?: string;
}

export interface ToolResultRecord {
  name: string;
  result: unknown;
}

/**
 * Events the loop yields to the SSE endpoint. The chat UI consumes these.
 *
 *  - text-delta:      one streamed text fragment from the model
 *  - tool-call:       the model wants to invoke a tool (post-stream of one turn)
 *  - tool-result:     a tool finished executing (with its return value)
 *  - assistant-turn:  one whole assistant response just finished — used by the
 *                     route handler to persist the row to chat_messages
 *  - tool-exchange:   one whole tool call+response pair just finished — same,
 *                     but persisted as role='tool' rows
 *  - turn-complete:   the model produced a final answer with no further tools
 *  - error:           something blew up; payload has the message
 */
export type AgentEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; name: string; args: Record<string, unknown> }
  | { type: "tool-result"; name: string; result: unknown }
  | {
      type: "assistant-turn";
      content: string;
      toolCalls: ToolCallRecord[];
    }
  | { type: "tool-exchange"; name: string; args: Record<string, unknown>; result: unknown }
  | { type: "turn-complete" }
  | { type: "error"; message: string };

interface RunAgentLoopOptions {
  /** Conversation history in Gemini Content shape, oldest first. */
  history: Content[];
  /** The new user message (text only — we don't support multimodal in v1). */
  userMessage: string;
  supabase: SupabaseClient;
  userId: string;
  todayISO: string;
}

/**
 * Streaming agent loop. Yields events as they happen so the SSE endpoint can
 * forward them to the client and persist appropriate ones to the chat log.
 *
 * Loop shape:
 *   1. Append user message to contents.
 *   2. Stream Gemini's response — accumulate text deltas, collect function calls.
 *   3. After the stream finishes:
 *      - If no function calls: emit assistant-turn + turn-complete and return.
 *      - Otherwise: emit assistant-turn (with function-call list), execute each
 *        tool, emit tool-exchange events, append all tool responses, loop.
 *   4. If we exceed MAX_TOOL_ROUNDTRIPS, emit an error event and stop.
 */
export async function* runAgentLoop(
  opts: RunAgentLoopOptions,
): AsyncGenerator<AgentEvent> {
  const ai = geminiClient();
  const contents: Content[] = [
    ...opts.history,
    { role: "user", parts: [{ text: opts.userMessage }] },
  ];

  for (let step = 0; step < MAX_TOOL_ROUNDTRIPS; step++) {
    let stream;
    try {
      stream = await ai.models.generateContentStream({
        model: GEMINI_MODEL,
        contents,
        config: {
          systemInstruction: AGENT_SYSTEM_PROMPT,
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
          temperature: 0.3,
        },
      });
    } catch (e) {
      yield {
        type: "error",
        message: `Gemini call failed: ${e instanceof Error ? e.message : String(e)}`,
      };
      return;
    }

    let assistantText = "";
    const toolCalls: ToolCallRecord[] = [];

    try {
      for await (const chunk of stream) {
        // Walk the raw parts ourselves rather than using chunk.text /
        // chunk.functionCalls — those getters strip the part-level
        // `thoughtSignature` that Gemini 3 requires on the round-trip.
        const parts = chunk.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          // Skip "thought" parts (model's internal reasoning) — we don't
          // surface chain-of-thought to the user, and Gemini doesn't require
          // their signatures on subsequent requests.
          if (part.thought) continue;

          if (typeof part.text === "string" && part.text.length > 0) {
            assistantText += part.text;
            yield { type: "text-delta", text: part.text };
          }
          if (part.functionCall?.name) {
            toolCalls.push({
              name: part.functionCall.name,
              args: (part.functionCall.args ?? {}) as Record<string, unknown>,
              thoughtSignature: part.thoughtSignature,
            });
          }
        }
      }
    } catch (e) {
      yield {
        type: "error",
        message: `Streaming failed: ${e instanceof Error ? e.message : String(e)}`,
      };
      return;
    }

    // Append the assistant turn to contents BEFORE executing tools — the
    // tool response parts must follow the model turn that requested them.
    // Echo the original thoughtSignature on each functionCall part: Gemini 3
    // rejects the next request otherwise.
    const assistantParts: Part[] = [];
    if (assistantText) assistantParts.push({ text: assistantText });
    for (const tc of toolCalls) {
      const part: Part = { functionCall: { name: tc.name, args: tc.args } };
      if (tc.thoughtSignature) part.thoughtSignature = tc.thoughtSignature;
      assistantParts.push(part);
    }
    contents.push({ role: "model", parts: assistantParts });

    yield { type: "assistant-turn", content: assistantText, toolCalls };

    if (toolCalls.length === 0) {
      yield { type: "turn-complete" };
      return;
    }

    // Execute every tool the model called this turn, in order. Gemini accepts
    // all functionResponse parts in a single user-role turn following the
    // model turn that called them.
    const responseParts: Part[] = [];
    for (const tc of toolCalls) {
      yield { type: "tool-call", name: tc.name, args: tc.args };
      const result = await executeTool(
        tc.name,
        tc.args,
        opts.supabase,
        opts.userId,
        opts.todayISO,
      );
      yield { type: "tool-result", name: tc.name, result };
      yield { type: "tool-exchange", name: tc.name, args: tc.args, result };
      responseParts.push({
        functionResponse: {
          name: tc.name,
          // Wrap in an object — Gemini's protocol expects response.response.<key>=value;
          // we use a single 'result' key to keep the shape simple.
          response: { result: result ?? null },
        },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  yield {
    type: "error",
    message: `Tool round-trip cap (${MAX_TOOL_ROUNDTRIPS}) reached without a final answer.`,
  };
}

/**
 * Convert chat_messages rows back to Gemini's Content[] shape, in the order
 * Gemini expects: user → model → user(functionResponse) → model → ...
 *
 * For multi-tool turns we group consecutive tool rows into a single user turn
 * (Gemini protocol requires this).
 */
export function messagesToGeminiContents(
  rows: Array<{
    role: "user" | "assistant" | "tool" | "system";
    content: string | null;
    toolCalls: unknown;
    toolName: string | null;
    toolResponse: unknown;
  }>,
): Content[] {
  const out: Content[] = [];
  let pendingToolResponses: Part[] = [];

  const flushPendingTools = () => {
    if (pendingToolResponses.length > 0) {
      out.push({ role: "user", parts: pendingToolResponses });
      pendingToolResponses = [];
    }
  };

  for (const r of rows) {
    if (r.role === "user") {
      flushPendingTools();
      out.push({ role: "user", parts: [{ text: r.content ?? "" }] });
    } else if (r.role === "assistant") {
      flushPendingTools();
      const parts: Part[] = [];
      if (r.content) parts.push({ text: r.content });
      const tcs = (r.toolCalls as ToolCallRecord[] | null) ?? [];
      for (const tc of tcs) {
        // Carry the thoughtSignature back so subsequent Gemini requests
        // pass validation. Without it the next turn would fail with
        // "Function call is missing a thought_signature".
        const part: Part = { functionCall: { name: tc.name, args: tc.args } };
        if (tc.thoughtSignature) part.thoughtSignature = tc.thoughtSignature;
        parts.push(part);
      }
      if (parts.length > 0) out.push({ role: "model", parts });
    } else if (r.role === "tool") {
      pendingToolResponses.push({
        functionResponse: {
          name: r.toolName ?? "unknown",
          response: { result: r.toolResponse ?? null },
        },
      });
    }
    // system rows aren't added — system instruction lives in config.
  }
  flushPendingTools();
  return out;
}
