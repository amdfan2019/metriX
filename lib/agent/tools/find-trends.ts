import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORY_VALUES, type Category } from "@/lib/db/schema";
import { fetchNonSpendableAccountIds } from "@/lib/budgets/spendable-accounts";

export interface TrendRow {
  category: Category;
  /** Per-month totals oldest → newest, positive cents. Length = months window. */
  monthly_cents: number[];
  months: string[];
  /** Most recent vs prior month, positive % for increase. */
  mom_change_pct: number | null;
  /** Most recent vs trailing-mean (excluding most recent). */
  vs_trailing_mean_pct: number | null;
  /** Boolean: most recent > trailing mean × 1.5 — used for "spike" callouts. */
  is_spike: boolean;
}

const NON_OUTFLOW = new Set<Category>(["income", "transfer"]);

/**
 * `find_trends(category?, months?)` — compares spending across the last N
 * months (default 6, capped at 12). Returns per-month totals and two ratios:
 * month-over-month and most-recent-vs-trailing-mean. The agent uses these to
 * narrate "your dining is up 40% this month" without doing the math itself.
 */
export async function findTrends(
  supabase: SupabaseClient,
  userId: string,
  args: Record<string, unknown>,
  todayISO: string,
): Promise<{ months: number; rows: TrendRow[] }> {
  const monthsArg = Number(args.months);
  const monthsWindow = Number.isFinite(monthsArg) && monthsArg > 1
    ? Math.min(12, Math.floor(monthsArg))
    : 6;

  const categoryArg = typeof args.category === "string" ? args.category : null;
  const filterCategory =
    categoryArg && (CATEGORY_VALUES as readonly string[]).includes(categoryArg)
      ? (categoryArg as Category)
      : null;

  // Build the list of YYYY-MM month strings, oldest first, ending with current.
  const months = listLastNMonths(todayISO, monthsWindow);
  const start = `${months[0]}-01`;
  const end = todayISO;

  const excludedAccountIds = await fetchNonSpendableAccountIds(supabase, userId);
  let q = supabase
    .from("transactions")
    .select("category, amount_cents, transaction_date")
    .eq("user_id", userId)
    .eq("is_transfer", false)
    .gte("transaction_date", start)
    .lte("transaction_date", end)
    .lt("amount_cents", 0);
  if (excludedAccountIds.length > 0) {
    q = q.not("account_id", "in", `(${excludedAccountIds.join(",")})`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`find_trends failed: ${error.message}`);

  // Bucket: category → month → cents
  const byCatMonth = new Map<Category, Map<string, number>>();
  for (const r of data ?? []) {
    const cat = r.category as Category | null;
    if (!cat || NON_OUTFLOW.has(cat)) continue;
    if (filterCategory && cat !== filterCategory) continue;
    const date = r.transaction_date as string;
    const month = date.slice(0, 7);
    if (!months.includes(month)) continue;
    let inner = byCatMonth.get(cat);
    if (!inner) {
      inner = new Map<string, number>();
      byCatMonth.set(cat, inner);
    }
    inner.set(month, (inner.get(month) ?? 0) + Math.abs(r.amount_cents as number));
  }

  const targetCategories: readonly Category[] = filterCategory
    ? [filterCategory]
    : (CATEGORY_VALUES as readonly Category[]).filter((c) => !NON_OUTFLOW.has(c));

  const rows: TrendRow[] = targetCategories.map((cat) => {
    const inner = byCatMonth.get(cat);
    const monthly = months.map((m) => inner?.get(m) ?? 0);

    const recent = monthly[monthly.length - 1];
    const prev = monthly.length >= 2 ? monthly[monthly.length - 2] : 0;
    const trailing = monthly.slice(0, -1);
    const trailingMean =
      trailing.length > 0
        ? trailing.reduce((s, x) => s + x, 0) / trailing.length
        : 0;

    const momPct = prev > 0 ? Math.round(((recent - prev) / prev) * 100) : null;
    const vsTrailingPct =
      trailingMean > 0 ? Math.round(((recent - trailingMean) / trailingMean) * 100) : null;
    const isSpike = trailingMean > 0 && recent > trailingMean * 1.5;

    return {
      category: cat,
      monthly_cents: monthly,
      months,
      mom_change_pct: momPct,
      vs_trailing_mean_pct: vsTrailingPct,
      is_spike: isSpike,
    };
  });

  return { months: monthsWindow, rows };
}

/** Returns the last N months as YYYY-MM strings, oldest first, ending with todayISO's month. */
function listLastNMonths(todayISO: string, n: number): string[] {
  const year = Number(todayISO.slice(0, 4));
  const month = Number(todayISO.slice(5, 7));
  const out: string[] = [];
  for (let offset = n - 1; offset >= 0; offset--) {
    let y = year;
    let m = month - offset;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}
