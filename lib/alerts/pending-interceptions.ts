import type { Category } from "@/lib/db/schema";
import type { AlertCandidate, AlertTxnInput } from "./types";

export interface BudgetCap {
  category: Category;
  monthlyCapCents: number;
}

export interface DetectPendingOptions {
  todayISO: string;
  /** Per-category budget caps. Pending txns in categories with no cap are skipped. */
  budgets: BudgetCap[];
  /** Already-posted spend for the current month, per category. */
  postedSpentByCategory: Partial<Record<Category, number>>;
  /** Already-counted upcoming committed (recurring) for the rest of the month, per category. */
  upcomingCommittedByCategory?: Partial<Record<Category, number>>;
}

/**
 * Pending transactions that — if they post — would push their category's
 * total spend (already-posted + this pending + already-counted upcoming
 * recurring) over the cap. Two-day-out warning that lets the user cancel
 * a marginal purchase before it lands.
 *
 * Only outflows. Tolerant when no cap is set (skip — nothing to compare to).
 * Flag once per pending txn; resolves automatically on the next scan when
 * the txn posts (no longer pending).
 */
export function detectPendingInterceptions(
  txns: AlertTxnInput[],
  options: DetectPendingOptions,
): AlertCandidate[] {
  const monthStart = options.todayISO.slice(0, 8) + "01";
  const capsByCategory = new Map<Category, number>();
  for (const b of options.budgets) capsByCategory.set(b.category, b.monthlyCapCents);

  const pendings = txns.filter(
    (t) =>
      t.pending &&
      t.amountCents < 0 &&
      !t.isTransfer &&
      t.category &&
      t.category !== "income" &&
      t.category !== "transfer" &&
      t.transactionDate >= monthStart,
  );

  const out: AlertCandidate[] = [];
  // Track already-projected pending per category so multiple pending txns in
  // the same category compound — first that tips it gets a critical, the rest
  // pile up as warns.
  const projectedByCat: Partial<Record<Category, number>> = {};

  for (const t of pendings) {
    const cat = t.category!;
    const cap = capsByCategory.get(cat);
    if (cap == null || cap <= 0) continue;

    const posted = options.postedSpentByCategory[cat] ?? 0;
    const upcoming = options.upcomingCommittedByCategory?.[cat] ?? 0;
    const priorPending = projectedByCat[cat] ?? 0;
    const thisAmount = Math.abs(t.amountCents);
    const projectedTotal = posted + upcoming + priorPending + thisAmount;

    if (projectedTotal <= cap) {
      projectedByCat[cat] = priorPending + thisAmount;
      continue;
    }

    const overBy = projectedTotal - cap;
    const severity = overBy >= cap * 0.2 ? "critical" : "warn";
    const fmtAmt = `$${(thisAmount / 100).toFixed(2)}`;
    const fmtCap = `$${(cap / 100).toFixed(2)}`;
    const fmtOver = `$${(overBy / 100).toFixed(2)}`;
    const merchant = t.merchantName ?? t.description;

    out.push({
      kind: "pending_over_budget",
      severity,
      title: `Pending ${cat} charge would push you over`,
      body: `${fmtAmt} pending at ${merchant}. If it posts, ${cat} would land at ${fmtOver} above the ${fmtCap} cap.`,
      dedupKey: `pending_over_budget:${t.id}`,
      sourceTransactionId: t.id,
      metadata: {
        category: cat,
        merchant_name: t.merchantName,
        amount_cents: thisAmount,
        cap_cents: cap,
        posted_cents: posted,
        upcoming_cents: upcoming,
        projected_total_cents: projectedTotal,
        over_cents: overBy,
      },
    });
    projectedByCat[cat] = priorPending + thisAmount;
  }

  return out;
}
