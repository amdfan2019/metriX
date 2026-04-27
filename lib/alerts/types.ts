import type { AlertKind, AlertSeverity, Category } from "@/lib/db/schema";

/**
 * What every detector returns. The scan layer turns these into rows.
 * `dedupKey` is the natural identity of the anomaly — re-scans upsert on it,
 * so the same alert never duplicates.
 */
export interface AlertCandidate {
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  body: string;
  dedupKey: string;
  sourceTransactionId?: string | null;
  sourceRecurringId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Minimum transaction shape every detector consumes. Decoupled from DB rows. */
export interface AlertTxnInput {
  id: string;
  transactionDate: string; // YYYY-MM-DD
  description: string;
  merchantName: string | null;
  category: Category | null;
  amountCents: number; // negative for outflow
  isTransfer: boolean;
  pending: boolean;
  recurringExpenseId: string | null;
}

/** Minimum recurring shape every detector consumes. */
export interface AlertRecurringInput {
  id: string;
  merchantName: string;
  category: Category;
  cadence: "weekly" | "fortnightly" | "monthly" | "yearly";
  direction: "expense" | "income";
  typicalAmountCents: number;
  nextExpectedDate: string;
  status: "active" | "inactive";
  ignored: boolean;
  legCount: number;
}
