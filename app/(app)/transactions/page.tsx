import Link from "next/link";
import { X } from "lucide-react";
import { fetchUserTransactions } from "@/lib/budgets/transactions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_VALUES, type Category } from "@/lib/db/schema";
import { RunCategorisationButton } from "./run-categorisation-button";
import { ReviewRow } from "./review-row";
import { TransactionRow } from "./transaction-row";

const CATEGORY_LABELS: Record<Category, string> = {
  groceries: "Groceries",
  dining: "Dining",
  housing: "Housing",
  utilities: "Utilities",
  transport: "Transport",
  entertainment: "Entertainment",
  shopping: "Shopping",
  health: "Health",
  income: "Income",
  transfer: "Transfer",
  other: "Other",
};

type SearchParams = Promise<{ category?: string }>;

const audWhole = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 2,
});

function fmt(cents: number) {
  return audWhole.format(cents / 100);
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const filterCategory = (CATEGORY_VALUES as readonly string[]).includes(params.category ?? "")
    ? (params.category as Category)
    : null;

  const allTxns = await fetchUserTransactions({ limit: 500 });
  const txns = filterCategory
    ? allTxns.filter((t) => t.category === filterCategory)
    : allTxns;

  // Stats are over the *full* set so the header still shows totals when filtered.
  const reviewQueue = allTxns.filter((t) => t.needsReview);
  const stats = {
    total: allTxns.length,
    filtered: txns.length,
    fromBasiq: allTxns.filter((t) => t.fromBasiq).length,
    uncategorised: allTxns.filter((t) => t.category === null && !t.needsReview).length,
    needsReview: reviewQueue.length,
    transfers: allTxns.filter((t) => t.isTransfer).length,
  };

  const pendingForCategorisation = stats.uncategorised;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            {stats.total === 0
              ? "Nothing here yet. Connect a bank or seed dev data on the dashboard."
              : `${stats.total} total · ${stats.fromBasiq} from Basiq · ${stats.uncategorised} uncategorised · ${stats.needsReview} need review · ${stats.transfers} transfer-tagged`}
          </p>
          {filterCategory && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1.5">
                Showing {CATEGORY_LABELS[filterCategory]} · {stats.filtered}
              </Badge>
              <Link
                href="/transactions"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" aria-hidden />
                clear filter
              </Link>
            </div>
          )}
        </div>
        {stats.total > 0 && <RunCategorisationButton pendingCount={pendingForCategorisation} />}
      </header>

      {reviewQueue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Needs review ({reviewQueue.length})</CardTitle>
            <CardDescription>
              Gemini wasn&apos;t confident enough — confirm or correct. Each decision saves an
              alias so we don&apos;t ask again for the same merchant.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {reviewQueue.slice(0, 50).map((t) => (
                <ReviewRow
                  key={t.id}
                  txnId={t.id}
                  description={t.description}
                  merchantName={t.merchantName}
                  category={t.category}
                  confidence={t.confidence}
                  amountFmt={fmt(t.amountCents)}
                  transactionDate={t.transactionDate}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {txns.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              No transactions yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Date</th>
                    <th className="px-4 py-2 text-left font-medium">Merchant / description</th>
                    <th className="px-4 py-2 text-left font-medium">Category</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {txns.map((t) => (
                    <TransactionRow
                      key={t.id}
                      id={t.id}
                      description={t.description}
                      merchantName={t.merchantName}
                      category={t.category}
                      amountCents={t.amountCents}
                      amountFmt={fmt(t.amountCents)}
                      transactionDate={t.transactionDate}
                      pending={t.pending}
                      isTransfer={t.isTransfer}
                      needsReview={t.needsReview}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
