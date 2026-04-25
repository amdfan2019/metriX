// Pair-detection of internal transfers (e.g. checking → savings, credit-card
// payments) so they don't double-count in budget burn. See docs/PROMPT.md
// "Confirmed answers" → "Transfers/duplicates" for the agreed approach.

const TRANSFER_DESCRIPTION_PATTERNS: RegExp[] = [
  /\btransfer\b/i,
  /\bpayment\b/i,
  /\bbpay\b/i,
  /\binternal\b/i,
  /credit\s*card/i,
  /direct\s+(credit|debit)/i,
];

export function descriptionLooksLikeTransfer(description: string): boolean {
  return TRANSFER_DESCRIPTION_PATTERNS.some((p) => p.test(description));
}

function daysApart(a: string, b: string): number {
  const ma = Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)));
  const mb = Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10)));
  return Math.round(Math.abs(ma - mb) / 86400000);
}

export interface PairableTransaction {
  id: string;
  amountCents: number;
  transactionDate: string; // YYYY-MM-DD
  description: string;
  accountId: string | null;
}

interface IsTransferPairOptions {
  /** Maximum days between the two legs. Default 2. */
  windowDays?: number;
}

export function isTransferPair(
  a: PairableTransaction,
  b: PairableTransaction,
  options: IsTransferPairOptions = {},
): boolean {
  const windowDays = options.windowDays ?? 2;
  if (a.amountCents === 0 || b.amountCents === 0) return false;
  if (a.amountCents + b.amountCents !== 0) return false; // must mirror exactly
  // Same account on both sides isn't a transfer (it's two separate tx in one account).
  if (a.accountId !== null && b.accountId !== null && a.accountId === b.accountId) return false;
  if (daysApart(a.transactionDate, b.transactionDate) > windowDays) return false;
  // At least one leg must read like a transfer; otherwise we risk pairing two
  // unrelated transactions that happen to mirror in amount and date.
  if (
    !descriptionLooksLikeTransfer(a.description) &&
    !descriptionLooksLikeTransfer(b.description)
  ) {
    return false;
  }
  return true;
}

/**
 * Greedy pairing: iterate transactions and pair each with the first remaining
 * transaction that looks like its mirror leg. Returns the set of transaction ids
 * that are part of *any* transfer pair.
 */
export function findTransferPairs(transactions: PairableTransaction[]): Set<string> {
  const paired = new Set<string>();

  for (let i = 0; i < transactions.length; i++) {
    if (paired.has(transactions[i].id)) continue;
    for (let j = i + 1; j < transactions.length; j++) {
      if (paired.has(transactions[j].id)) continue;
      if (isTransferPair(transactions[i], transactions[j])) {
        paired.add(transactions[i].id);
        paired.add(transactions[j].id);
        break;
      }
    }
  }

  return paired;
}
