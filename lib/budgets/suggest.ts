import { CATEGORY_VALUES, type Category } from "@/lib/db/schema";

/**
 * Sydney/AU-tuned default split of post-savings income across spend categories.
 * Sums to 1.0. Anchored on rent (housing dominates AU household budgets) with
 * room for the rest. The user's expected to adjust — these are first-pass
 * suggestions, not prescriptions.
 *
 * income, transfer: not in the split (income is the source, transfer is
 * cross-account movement, neither belongs in a category cap).
 */
const DEFAULT_SPLIT: Partial<Record<Category, number>> = {
  housing: 0.36,
  groceries: 0.15,
  utilities: 0.07,
  transport: 0.10,
  dining: 0.10,
  entertainment: 0.07, // includes streaming subscriptions (Netflix, Spotify, etc)
  shopping: 0.08,
  health: 0.05, // includes gym memberships (Goodlife, F45, etc)
  other: 0.02,
};

/**
 * Sensible per-category ceilings. At very high incomes the percentage split
 * suggests numbers that don't reflect typical spending — capping keeps
 * suggestions grounded. The leftover from a capped category goes back into
 * the "other" residual rather than sloshing across categories.
 */
const CATEGORY_CAP_CENTS: Partial<Record<Category, number>> = {
  utilities: 40000, // $400/mo
  health: 40000, // $400/mo (medical/dental — non-recurring averages, plus gym)
  transport: 60000, // $600/mo
  entertainment: 50000, // $500/mo (includes streaming)
  groceries: 150000, // $1500/mo (very generous)
  dining: 150000, // $1500/mo
  shopping: 150000, // $1500/mo
};

/**
 * Default savings target as a fraction of income, used by the onboarding
 * wizard when the user hasn't picked a value yet. 15% is a common starting
 * point in AU personal-finance guidance.
 */
export const DEFAULT_SAVINGS_RATIO = 0.15;

export interface SuggestionRow {
  category: Category;
  cents: number;
  /** % of total income this allocation represents. Useful for tooltips. */
  pct_of_income: number;
}

export interface SuggestBudgetsResult {
  /** The income fed in. */
  income_cents: number;
  /** Savings target in cents (set aside before category split). */
  savings_target_cents: number;
  /** What's left after savings — divided up by the split below. */
  spending_envelope_cents: number;
  /** Per-category suggested cap (positive cents). */
  rows: SuggestionRow[];
  /** Sum of category suggestions — usually equals spending_envelope_cents minus
   *  any caps' headroom that fell back to "other". */
  total_allocated_cents: number;
  /** Anything left after caps, allocated to "other" as buffer. */
  uncapped_buffer_cents: number;
}

/**
 * Pure function. Given a monthly income and savings target, returns a
 * suggested cap per category.
 *
 * Algorithm:
 *   1. Carve savings target from income → spending envelope.
 *   2. For each category in DEFAULT_SPLIT, raw = envelope × split.
 *   3. Cap at CATEGORY_CAP_CENTS where present; track headroom freed by capping.
 *   4. Pour all freed headroom into "other" so totals add up to the envelope.
 *   5. Round to whole dollars (avoid weird $X.47/mo cap suggestions).
 *
 * If income is null/zero or savings target ≥ income, returns zero suggestions
 * for every category — caller decides how to surface that ("set income first").
 */
export function suggestBudgets(
  incomeCents: number | null,
  savingsTargetCents: number | null,
): SuggestBudgetsResult {
  const income = incomeCents ?? 0;
  const savingsTarget = Math.max(0, savingsTargetCents ?? 0);
  const envelope = Math.max(0, income - savingsTarget);

  if (envelope <= 0) {
    return {
      income_cents: income,
      savings_target_cents: savingsTarget,
      spending_envelope_cents: envelope,
      rows: (CATEGORY_VALUES as readonly Category[])
        .filter((c) => DEFAULT_SPLIT[c] != null)
        .map((c) => ({ category: c, cents: 0, pct_of_income: 0 })),
      total_allocated_cents: 0,
      uncapped_buffer_cents: 0,
    };
  }

  // First pass: raw split, cap where applicable.
  let buffer = 0;
  const draft: { category: Category; cents: number; capped: boolean }[] = [];
  for (const category of CATEGORY_VALUES as readonly Category[]) {
    const ratio = DEFAULT_SPLIT[category];
    if (ratio == null) continue;
    const raw = Math.round(envelope * ratio);
    const cap = CATEGORY_CAP_CENTS[category];
    if (cap != null && raw > cap) {
      buffer += raw - cap;
      draft.push({ category, cents: roundToWholeDollars(cap), capped: true });
    } else {
      draft.push({ category, cents: roundToWholeDollars(raw), capped: false });
    }
  }

  // Second pass: pour buffer into "other" so the envelope stays whole.
  if (buffer > 0) {
    const other = draft.find((d) => d.category === "other");
    if (other) other.cents = roundToWholeDollars(other.cents + buffer);
  }

  const rows: SuggestionRow[] = draft.map(({ category, cents }) => ({
    category,
    cents,
    pct_of_income: income > 0 ? Math.round((cents / income) * 1000) / 10 : 0,
  }));

  return {
    income_cents: income,
    savings_target_cents: savingsTarget,
    spending_envelope_cents: envelope,
    rows,
    total_allocated_cents: rows.reduce((sum, r) => sum + r.cents, 0),
    uncapped_buffer_cents: buffer,
  };
}

function roundToWholeDollars(cents: number): number {
  return Math.round(cents / 100) * 100;
}
