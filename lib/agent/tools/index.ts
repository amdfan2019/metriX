/**
 * Agent tool registry.
 *
 * Each tool is a pure async function: (supabase, userId, args) → JSON-serialisable
 * result. The tool's Gemini function declaration lives alongside in
 * `declarations.ts` and the dispatcher routes name → handler.
 *
 * The handlers all run as the authenticated user — RLS scopes the queries.
 * Never let the model influence which user_id is queried.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBudgetStatus } from "./budget-status";
import { getRecentTransactions } from "./recent-transactions";
import { getSpendingByCategory } from "./spending-by-category";
import { projectMonthEndTool } from "./project-month-end";
import { canIAfford } from "./can-i-afford";
import { findTrends } from "./find-trends";
import { getOverallHealth } from "./overall-health";
import { getRecurringIncome } from "./recurring-income";

export type ToolHandler = (
  supabase: SupabaseClient,
  userId: string,
  args: Record<string, unknown>,
  todayISO: string,
) => Promise<unknown>;

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  get_budget_status: getBudgetStatus,
  get_recent_transactions: getRecentTransactions,
  get_spending_by_category: getSpendingByCategory,
  project_month_end: projectMonthEndTool,
  can_i_afford: canIAfford,
  find_trends: findTrends,
  get_overall_health: getOverallHealth,
  get_recurring_income: getRecurringIncome,
};

export type ToolName = keyof typeof TOOL_HANDLERS;

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  supabase: SupabaseClient,
  userId: string,
  todayISO: string,
): Promise<unknown> {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return { error: `Unknown tool: ${name}` };
  }
  try {
    return await handler(supabase, userId, args ?? {}, todayISO);
  } catch (e) {
    console.error(`[tool ${name}] failed:`, e);
    return { error: e instanceof Error ? e.message : "Tool execution failed." };
  }
}
