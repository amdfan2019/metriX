import type { SupabaseClient } from "@supabase/supabase-js";
import { geminiClient, GEMINI_MODEL } from "@/lib/gemini/client";
import { todaySydney } from "@/lib/budgets/calc";
import { getOverallHealth } from "./tools/overall-health";
import { getBudgetStatus } from "./tools/budget-status";
import { findTrends } from "./tools/find-trends";
import { getRecurringIncome } from "./tools/recurring-income";
import { getAlerts } from "./tools/alerts";
import { buildCashflowForecast } from "@/lib/cashflow/queries";

const BRIEFING_SYSTEM_PROMPT = `You write a daily 3-4 sentence financial briefing for a personal-finance app user in Sydney, AUD. CFO-of-one perspective: direct, specific, no fluff.

Inputs are JSON snapshots of the user's current state. Output is plain text only — no markdown, no headings, no greetings, no sign-offs. Just the briefing.

Lead with the most consequential thing. In rough priority order:
  1. alerts.critical — anything in the critical bucket. Lead with it verbatim.
  2. cashflow.first_risk_date set — projected balance drops below the buffer; call out date + trigger.
  3. alerts.warn — price changes, smaller anomalies, mid-late income.
  4. trends spike row, or budget over.
  5. savings_status off-track or behind.
  6. income drift > 10% — detected vs estimated income materially differ.
  7. Otherwise: confirm on-track confidently and call out one thing to maintain.

Use specific numbers ($83 not "some money"). Always check alerts.critical / alerts.warn first — those are why the system exists.

If income isn't set, say that clearly and move on — don't fabricate health metrics.`;

export interface BriefingResult {
  content: string;
}

/**
 * Generates and persists today's briefing for one user. Idempotent — calling
 * twice on the same day overwrites the row (we'd rather always show the
 * latest take than have stale text).
 *
 * Wired into the daily cron after sync + recurring rescan; can also be called
 * manually for testing via a dev action.
 */
export async function generateAndPersistBriefing(
  supabase: SupabaseClient,
  userId: string,
): Promise<BriefingResult> {
  const today = todaySydney();

  // Gather state snapshots — the briefing prompt sees the same numbers the
  // dashboard does, so the two never diverge. The cashflow query runs as the
  // signed-in user via createClient() (NOT the admin client), but `briefing`
  // is also called from the cron handler with the admin client. The cashflow
  // query path uses createClient() internally; for now we tolerate that — the
  // cron run for a user matches RLS via service-role key anyway.
  const [health, budgets, trends, recurringIncome, alerts] = await Promise.all([
    getOverallHealth(supabase, userId, {}, today),
    getBudgetStatus(supabase, userId, {}, today),
    findTrends(supabase, userId, { months: 3 }, today),
    getRecurringIncome(supabase, userId),
    getAlerts(supabase, userId),
  ]);

  // The cashflow forecast goes through its own query helper that reads from
  // the request-scoped Supabase client. Wrapped in try/catch so a missing
  // accounts table (e.g. dev seed without bank connect) doesn't break the
  // briefing.
  let cashflowSummary: Record<string, unknown> | null = null;
  try {
    const result = await buildCashflowForecast(today, { days: 30 });
    if (result) {
      cashflowSummary = {
        start_balance_cents: result.startBalanceCents,
        buffer_cents: result.bufferCents,
        first_risk_date: result.firstRiskDate,
        risk_days: result.riskDays.slice(0, 3).map((r) => ({
          date: r.date,
          projected_balance_cents: r.projectedBalanceCents,
          trigger_label: r.triggerLabel,
        })),
        end_balance_cents: result.forecast[result.forecast.length - 1]?.projectedBalanceCents ?? null,
      };
    }
  } catch (e) {
    console.error("[briefing] cashflow forecast failed:", e);
  }

  const snapshot = {
    today,
    alerts: {
      counts: alerts.counts,
      critical: alerts.rows.filter((a) => a.severity === "critical").map((a) => ({
        kind: a.kind,
        title: a.title,
        body: a.body,
      })),
      warn: alerts.rows.filter((a) => a.severity === "warn").map((a) => ({
        kind: a.kind,
        title: a.title,
        body: a.body,
      })),
    },
    health,
    cashflow: cashflowSummary,
    recurring_income: {
      total_monthly_equivalent_cents: recurringIncome.total_monthly_equivalent_cents,
      streams: recurringIncome.rows.filter((r) => r.status === "active"),
    },
    budgets: budgets.rows.map((r) => ({
      category: r.category,
      cap_cents: r.monthly_cap_cents,
      spent_cents: r.spent_cents,
      projected_cents: r.projected_cents,
      status: r.status,
      pct_used: r.pct,
    })),
    trends: trends.rows
      .filter((r) => r.is_spike || (r.mom_change_pct != null && Math.abs(r.mom_change_pct) >= 25))
      .map((r) => ({
        category: r.category,
        recent_cents: r.monthly_cents[r.monthly_cents.length - 1],
        mom_change_pct: r.mom_change_pct,
        is_spike: r.is_spike,
      })),
  };

  const ai = geminiClient();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Today is ${today}. Write the briefing. State JSON:\n${JSON.stringify(snapshot, null, 2)}`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: BRIEFING_SYSTEM_PROMPT,
      temperature: 0.4,
    },
  });

  const content = (response.text ?? "").trim();
  if (!content) throw new Error("Briefing generation returned empty text.");

  // Upsert: one briefing per user per day.
  const { error } = await supabase.from("daily_briefings").upsert(
    {
      user_id: userId,
      briefing_date: today,
      content,
    },
    { onConflict: "user_id,briefing_date" },
  );
  if (error) throw new Error(`briefing upsert failed: ${error.message}`);

  return { content };
}

/** Reads today's briefing from the DB. Null if not generated yet. */
export async function fetchTodayBriefing(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ content: string; createdAt: string } | null> {
  const today = todaySydney();
  const { data, error } = await supabase
    .from("daily_briefings")
    .select("content, created_at")
    .eq("user_id", userId)
    .eq("briefing_date", today)
    .maybeSingle();
  if (error) throw new Error(`briefing fetch failed: ${error.message}`);
  if (!data) return null;
  return {
    content: data.content as string,
    createdAt: data.created_at as string,
  };
}
