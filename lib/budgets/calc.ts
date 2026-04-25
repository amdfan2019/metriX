import { CATEGORY_VALUES, type Category } from "@/lib/db/schema";

// Minimal shape calc needs from a transaction; keeps this module decoupled
// from the row type so it can be unit-tested without DB infra.
export interface CalcTransaction {
  category: Category | null;
  amountCents: number;
  transactionDate: string; // YYYY-MM-DD
}

export type CategorySpend = Partial<Record<Category, number>>;

// Categories that don't count toward category-budget burn:
//  - income: positive cash flow, has its own treatment in the UI
//  - transfer: detected mirror-image legs across user's accounts (see docs/PROMPT.md)
const EXCLUDED_FROM_BURN = new Set<Category>(["income", "transfer"]);

const SPENDING_CATEGORIES = CATEGORY_VALUES.filter((c) => !EXCLUDED_FROM_BURN.has(c));

export function listSpendingCategories(): Category[] {
  return [...SPENDING_CATEGORIES];
}

/**
 * Sums absolute outflows per category for the calendar month containing `todayISO`.
 * Inflows (positive amount_cents) and excluded categories are skipped.
 * Transactions with null category or dated after `todayISO` are skipped.
 */
export function currentMonthSpend(
  transactions: CalcTransaction[],
  todayISO: string,
): CategorySpend {
  const monthStart = todayISO.slice(0, 8) + "01"; // YYYY-MM-01
  const out: CategorySpend = {};
  for (const t of transactions) {
    if (t.transactionDate < monthStart || t.transactionDate > todayISO) continue;
    if (t.amountCents >= 0) continue; // refunds and income aren't spend
    if (!t.category || EXCLUDED_FROM_BURN.has(t.category)) continue;
    out[t.category] = (out[t.category] ?? 0) + Math.abs(t.amountCents);
  }
  return out;
}

/**
 * Linear projection from days elapsed. Day 1/30 with $100 spent projects $3000.
 * If `todayISO` is the last day of the month, returns spentCents unchanged.
 */
export function projectMonthEnd(spentCents: number, todayISO: string): number {
  const year = Number(todayISO.slice(0, 4));
  const month = Number(todayISO.slice(5, 7));
  const day = Number(todayISO.slice(8, 10));
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day <= 0) return spentCents;
  return Math.round((spentCents * lastDayOfMonth) / day);
}

export type BudgetStatus = "ok" | "warn" | "over";

/**
 * 'over' at >= 100%, 'warn' at >= 80%, 'ok' otherwise.
 * A zero-or-negative cap is treated as 'ok' (no budget set).
 */
export function budgetStatus(spentCents: number, capCents: number): BudgetStatus {
  if (capCents <= 0) return "ok";
  const pct = spentCents / capCents;
  if (pct >= 1) return "over";
  if (pct >= 0.8) return "warn";
  return "ok";
}

/** "Today" in Sydney as YYYY-MM-DD. en-CA formatting yields ISO-shaped output. */
export function todaySydney(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
