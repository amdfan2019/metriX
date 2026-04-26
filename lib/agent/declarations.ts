import { Type, type FunctionDeclaration } from "@google/genai";
import { CATEGORY_VALUES } from "@/lib/db/schema";

/**
 * Gemini function declarations for the agent's tool surface.
 *
 * These describe each tool to Gemini so it can decide when to call them and
 * with what arguments. Names match keys in `lib/agent/tools/index.ts`.
 *
 * Keep descriptions terse but specific — the model leans on these to choose
 * the right tool for the user's question.
 */
export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "get_overall_health",
    description:
      "Whether the user is on track for the month overall. Returns estimated vs detected income, savings target/progress, spent + upcoming-recurring + flexible-remaining with status (on-track / tight / over / income-unset). Use this for 'how am I doing?' / 'am I saving enough?' / 'is my income on track?' questions and to ground other answers in current state.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_recurring_income",
    description:
      "List the user's detected recurring income streams (paychecks, regular freelance, etc) plus monthly-equivalent rollup. Use when reasoning about income stability, recent shifts, or comparing detected income against the user-entered estimate.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_budget_status",
    description:
      "Per-category spend vs budget for the requested month. Returns spent, projected month-end, status (ok/warn/over) for every category that has a budget set.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        month: {
          type: Type.STRING,
          description: "Month to query as YYYY-MM. Defaults to current month.",
        },
      },
    },
  },
  {
    name: "get_recent_transactions",
    description:
      "Most recent transactions, optionally filtered by category and look-back window. Use when the user asks 'what did I spend on X?' or wants to see specific charges. Excludes transfers.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          enum: [...CATEGORY_VALUES],
          description: "Category filter. Omit to include all spend categories.",
        },
        days: {
          type: Type.NUMBER,
          description: "Look-back window in days. Default 30, max 365.",
        },
        limit: {
          type: Type.NUMBER,
          description: "Max number of transactions. Default 50, max 200.",
        },
      },
    },
  },
  {
    name: "get_spending_by_category",
    description:
      "Aggregated outflow per category between two ISO dates inclusive. Use when the user asks for totals over a window (e.g. 'how much on dining last quarter').",
    parameters: {
      type: Type.OBJECT,
      properties: {
        start_date: { type: Type.STRING, description: "Inclusive start, YYYY-MM-DD." },
        end_date: { type: Type.STRING, description: "Inclusive end, YYYY-MM-DD." },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "project_month_end",
    description:
      "Linear projection of month-end spend per category from days elapsed. Use to answer 'at this pace, what will I have spent by month-end?'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          enum: [...CATEGORY_VALUES],
          description: "Category to project. Omit for all spend categories.",
        },
      },
    },
  },
  {
    name: "can_i_afford",
    description:
      "Decides yes / stretch / no for spending `amount` AUD in `category` right now, accounting for current spend and upcoming recurring expenses this month. Returns a structured verdict with reasoning.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        amount: { type: Type.NUMBER, description: "AUD dollars (not cents). Must be positive." },
        category: { type: Type.STRING, enum: [...CATEGORY_VALUES] },
      },
      required: ["amount", "category"],
    },
  },
  {
    name: "find_trends",
    description:
      "Month-over-month spending trends across the last N months (default 6). Returns per-month totals plus MoM % change and most-recent vs trailing-mean ratio. Useful for 'is my X spending up?' and detecting unusual spikes.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          enum: [...CATEGORY_VALUES],
          description: "Category filter. Omit for all categories.",
        },
        months: {
          type: Type.NUMBER,
          description: "Number of trailing months. Default 6, max 12.",
        },
      },
    },
  },
  {
    name: "get_balances",
    description:
      "Current and available balance per connected account, plus a 'spendable balance' rollup that excludes savings, credit cards, and loan accounts. Use when the user asks 'how much do I have?' or you need a balance to ground a cashflow answer.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_cashflow_forecast",
    description:
      "Projects the user's spendable balance forward day-by-day from current balance, active recurring inflows/outflows, and recent variable spend. Returns risk days where the projection drops below the configured cashflow buffer (default $200), with the trigger event for each. Use for 'will I run out of money on the 12th?' and proactive risk-flagging in the briefing.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        days: {
          type: Type.NUMBER,
          description: "Days ahead to project. Default 60, max 120.",
        },
        return_events: {
          type: Type.BOOLEAN,
          description:
            "When true, each day in the balance series carries the events that hit it (paychecks, bills, etc). Default false — saves tokens.",
        },
      },
    },
  },
];
