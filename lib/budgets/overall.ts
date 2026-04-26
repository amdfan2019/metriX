import { CATEGORY_VALUES, type Category } from "@/lib/db/schema";
import type { CalcTransaction, CategorySpend } from "./calc";

// Income/transfer never counts as outflow toward overall burn.
const NON_OUTFLOW_CATEGORIES = new Set<Category>(["income", "transfer"]);

export interface OverallHealthInput {
  monthlyIncomeCents: number | null;
  /** Optional savings goal — when set, drives savings status alongside flexible-remaining. */
  monthlySavingsTargetCents?: number | null;
  /** Transactions for the calendar month containing todayISO, up to and including todayISO. */
  monthTransactions: CalcTransaction[];
  /** Active recurring expenses whose next_expected_date is today < d <= end-of-month, summed by category. */
  committedRemaining: CategorySpend;
  todayISO: string;
}

export type OverallStatus = "on-track" | "tight" | "over" | "income-unset";
export type SavingsStatus = "on-track" | "behind" | "off-track" | "unset";

export interface OverallHealth {
  status: OverallStatus;
  /** Total outflow already spent this month (positive cents). */
  spentCents: number;
  /** Sum of committed_remaining across all categories (positive cents). */
  committedCents: number;
  /** monthly income, mirrored for convenience. null if unset. */
  monthlyIncomeCents: number | null;
  /** monthly savings target, null if unset. */
  monthlySavingsTargetCents: number | null;
  /** income − spent − committed. negative means projected over income. */
  flexibleRemainingCents: number;
  /** Days from today (inclusive) to month-end (inclusive). */
  daysRemaining: number;
  /** Per-day flexible remaining over remaining days. 0 when no income set. */
  perDayCents: number;
  /**
   * Progress toward the savings target = `flexibleRemainingCents` capped to
   * the target. If target is unset, this is null.
   */
  savingsProgressCents: number | null;
  /** Status of savings goal: 'unset' / 'on-track' / 'behind' / 'off-track'. */
  savingsStatus: SavingsStatus;
}

/**
 * "Are we on track this month?" Computed cleanly so the on-track card,
 * `can_i_afford`, and the daily briefing can all share the same view.
 *
 * Status thresholds:
 *   on-track  — flexible remaining >= 15% of monthly income
 *   tight     — flexible remaining > 0 but < 15%
 *   over      — flexible remaining <= 0
 *   income-unset — user hasn't entered income yet; status undefined
 */
export function computeOverallHealth(input: OverallHealthInput): OverallHealth {
  const spentCents = sumOutflows(input.monthTransactions, input.todayISO);
  const committedCents = sumCategorySpend(input.committedRemaining);
  const daysRemaining = daysToEndOfMonth(input.todayISO);
  const savingsTarget = input.monthlySavingsTargetCents ?? null;

  if (input.monthlyIncomeCents == null || input.monthlyIncomeCents <= 0) {
    return {
      status: "income-unset",
      spentCents,
      committedCents,
      monthlyIncomeCents: input.monthlyIncomeCents,
      monthlySavingsTargetCents: savingsTarget,
      flexibleRemainingCents: 0,
      daysRemaining,
      perDayCents: 0,
      savingsProgressCents: null,
      savingsStatus: savingsTarget != null ? "off-track" : "unset",
    };
  }

  const income = input.monthlyIncomeCents;
  const flexibleRemaining = income - spentCents - committedCents;

  let status: OverallStatus;
  if (flexibleRemaining <= 0) status = "over";
  else if (flexibleRemaining < income * 0.15) status = "tight";
  else status = "on-track";

  // Savings progress: amount left over IF the user trims to ≤ target. Capped
  // at target (anything above is buffer / pre-savings flex).
  let savingsProgressCents: number | null = null;
  let savingsStatus: SavingsStatus = "unset";
  if (savingsTarget != null && savingsTarget > 0) {
    savingsProgressCents = Math.max(0, Math.min(savingsTarget, flexibleRemaining));
    if (flexibleRemaining >= savingsTarget) {
      savingsStatus = "on-track";
    } else if (flexibleRemaining >= savingsTarget * 0.5) {
      savingsStatus = "behind";
    } else {
      savingsStatus = "off-track";
    }
  }

  return {
    status,
    spentCents,
    committedCents,
    monthlyIncomeCents: income,
    monthlySavingsTargetCents: savingsTarget,
    flexibleRemainingCents: flexibleRemaining,
    daysRemaining,
    perDayCents: daysRemaining > 0 ? Math.round(flexibleRemaining / daysRemaining) : 0,
    savingsProgressCents,
    savingsStatus,
  };
}

function sumOutflows(transactions: CalcTransaction[], todayISO: string): number {
  const monthStart = todayISO.slice(0, 8) + "01";
  let total = 0;
  for (const t of transactions) {
    if (t.transactionDate < monthStart || t.transactionDate > todayISO) continue;
    if (t.amountCents >= 0) continue;
    if (t.category && NON_OUTFLOW_CATEGORIES.has(t.category)) continue;
    total += Math.abs(t.amountCents);
  }
  return total;
}

function sumCategorySpend(s: CategorySpend): number {
  let sum = 0;
  for (const c of CATEGORY_VALUES) {
    sum += s[c] ?? 0;
  }
  return sum;
}

function daysToEndOfMonth(iso: string): number {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return lastDay - day + 1;
}
