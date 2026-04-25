import { fetchUserTransactions } from "@/lib/budgets/transactions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const audWhole = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 2,
});

function fmt(cents: number) {
  return audWhole.format(cents / 100);
}

const CATEGORY_LABELS: Record<string, string> = {
  groceries: "Groceries",
  dining: "Dining",
  rent: "Rent",
  utilities: "Utilities",
  transport: "Transport",
  entertainment: "Entertainment",
  shopping: "Shopping",
  health: "Health",
  subscriptions: "Subscriptions",
  income: "Income",
  transfer: "Transfer",
  other: "Other",
};

export default async function TransactionsPage() {
  const txns = await fetchUserTransactions({ limit: 500 });

  const stats = {
    total: txns.length,
    fromBasiq: txns.filter((t) => t.fromBasiq).length,
    uncategorised: txns.filter((t) => t.category === null).length,
    transfers: txns.filter((t) => t.isTransfer).length,
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          {stats.total === 0
            ? "Nothing here yet. Connect a bank or seed dev data on the dashboard."
            : `${stats.total} total · ${stats.fromBasiq} from Basiq · ${stats.uncategorised} uncategorised · ${stats.transfers} transfer-tagged`}
        </p>
      </header>

      {stats.uncategorised > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Categorisation pending</CardTitle>
            <CardDescription>
              {stats.uncategorised} transaction{stats.uncategorised === 1 ? "" : "s"} need a category. Slice 4 wires up
              the alias → trigram → Gemini resolver and a &ldquo;Run categorisation&rdquo; button.
            </CardDescription>
          </CardHeader>
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
                    <th className="px-4 py-2 text-left font-medium">Description</th>
                    <th className="px-4 py-2 text-left font-medium">Category</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {txns.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2 text-muted-foreground tabular-nums">
                        {t.transactionDate}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{t.description}</span>
                          {t.pending && (
                            <Badge variant="outline" className="text-[10px]">
                              pending
                            </Badge>
                          )}
                          {t.isTransfer && (
                            <Badge variant="secondary" className="text-[10px]">
                              transfer
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {t.category ? (
                          <span>{CATEGORY_LABELS[t.category] ?? t.category}</span>
                        ) : (
                          <span className="text-muted-foreground italic">uncategorised</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2 text-right tabular-nums",
                          t.amountCents < 0 ? "" : "text-emerald-600 dark:text-emerald-500",
                        )}
                      >
                        {fmt(t.amountCents)}
                      </td>
                    </tr>
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
