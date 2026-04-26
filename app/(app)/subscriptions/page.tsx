import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  fetchUserRecurring,
  fetchAdditionalIncome,
  type RecurringRow,
  type AdditionalIncomeRow,
} from "@/lib/recurring/queries";
import { CADENCE_LABEL, daysBetween } from "@/lib/recurring/cadence";
import { todaySydney } from "@/lib/budgets/calc";
import type { Category } from "@/lib/db/schema";
import { RescanButton } from "./rescan-button";
import { AddSubscriptionForm } from "./add-form";
import { RowActions } from "./row-actions";

const CATEGORY_LABELS: Record<Category, string> = {
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

const aud = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 2,
});
const fmt = (cents: number) => aud.format(cents / 100);

export default async function SubscriptionsPage() {
  const [all, additionalIncome] = await Promise.all([
    fetchUserRecurring(),
    fetchAdditionalIncome(60),
  ]);
  const today = todaySydney();

  // Split by direction, then by status / ignored within each.
  const expenses = all.filter((r) => r.direction === "expense");
  const income = all.filter((r) => r.direction === "income");

  const expActive = expenses.filter((r) => r.status === "active" && !r.ignored);
  const expInactive = expenses.filter((r) => r.status === "inactive" && !r.ignored);
  const expIgnored = expenses.filter((r) => r.ignored);

  const incActive = income.filter((r) => r.status === "active" && !r.ignored);
  const incInactive = income.filter((r) => r.status === "inactive" && !r.ignored);
  const incIgnored = income.filter((r) => r.ignored);

  const totalActiveExpenseMonthly = expActive.reduce((s, r) => s + monthlyEquivalentCents(r), 0);
  const totalActiveIncomeMonthly = incActive.reduce((s, r) => s + monthlyEquivalentCents(r), 0);
  const additional60dTotal = additionalIncome.reduce((s, r) => s + r.amountCents, 0);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recurring</h1>
          <p className="text-sm text-muted-foreground">
            {all.length === 0 && additionalIncome.length === 0
              ? "Detect recurring streams or enter your own — once we know what comes in and out we can plan ahead."
              : `${expActive.length} expense${expActive.length === 1 ? "" : "s"} · ${incActive.length} income · ${fmt(totalActiveExpenseMonthly)}/mo out · ${fmt(totalActiveIncomeMonthly)}/mo in`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RescanButton />
          <AddSubscriptionForm />
        </div>
      </header>

      {/* INCOME --------------------------------------------------------- */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Regular income</h2>
          {totalActiveIncomeMonthly > 0 && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {fmt(totalActiveIncomeMonthly)}/mo equivalent
            </p>
          )}
        </div>

        {incActive.length > 0 && (
          <Section title="Active" description="We expect these to land again on schedule.">
            <SubscriptionList rows={incActive} todayISO={today} />
          </Section>
        )}

        {incInactive.length > 0 && (
          <Section
            title="Inactive"
            description="No recent matching deposit — possibly ended."
          >
            <SubscriptionList rows={incInactive} todayISO={today} muted />
          </Section>
        )}

        {incIgnored.length > 0 && (
          <Section title="Ignored" description="You marked these as not regular.">
            <SubscriptionList rows={incIgnored} todayISO={today} muted />
          </Section>
        )}

        {incActive.length === 0 && incInactive.length === 0 && incIgnored.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No recurring income detected yet</CardTitle>
              <CardDescription>
                Once we see your paycheck land twice (and they line up at a regular cadence) we&apos;ll
                surface it here. Make sure paycheck transactions are categorised as Income.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {additionalIncome.length > 0 && (
          <Section
            title={`Additional income (last 60 days · ${fmt(additional60dTotal)})`}
            description="One-off deposits — gifts, refunds, ad-hoc pay. Not part of any series."
          >
            <ul className="divide-y">
              {additionalIncome.map((r) => (
                <AdditionalIncomeListItem key={r.id} row={r} />
              ))}
            </ul>
          </Section>
        )}
      </div>

      {/* EXPENSES ------------------------------------------------------- */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Recurring expenses</h2>
          {totalActiveExpenseMonthly > 0 && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {fmt(totalActiveExpenseMonthly)}/mo equivalent
            </p>
          )}
        </div>

        {expActive.length > 0 && (
          <Section title="Active" description="We expect these to charge again.">
            <SubscriptionList rows={expActive} todayISO={today} />
          </Section>
        )}

        {expInactive.length > 0 && (
          <Section
            title="Inactive"
            description="We haven't seen one of these in over a cadence — possibly cancelled."
          >
            <SubscriptionList rows={expInactive} todayISO={today} muted />
          </Section>
        )}

        {expIgnored.length > 0 && (
          <Section title="Ignored" description="You marked these as not recurring.">
            <SubscriptionList rows={expIgnored} todayISO={today} muted />
          </Section>
        )}

        {expenses.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nothing detected yet</CardTitle>
              <CardDescription>
                Once you have a few weeks of categorised transactions, click <strong>Rescan</strong> and
                we&apos;ll find recurring charges automatically. Or add one manually with the button above.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground/70">{description}</span>
      </div>
      <Card>
        <CardContent className="p-0">{children}</CardContent>
      </Card>
    </section>
  );
}

function SubscriptionList({
  rows,
  todayISO,
  muted = false,
}: {
  rows: RecurringRow[];
  todayISO: string;
  muted?: boolean;
}) {
  return (
    <ul className={`divide-y ${muted ? "opacity-70" : ""}`}>
      {rows.map((r) => (
        <SubscriptionRow key={r.id} row={r} todayISO={todayISO} />
      ))}
    </ul>
  );
}

function SubscriptionRow({ row, todayISO }: { row: RecurringRow; todayISO: string }) {
  const variance = row.maxAmountCents - row.minAmountCents;
  const showRange = variance > Math.max(100, row.typicalAmountCents * 0.05);
  const overdue = daysOverdue(row.nextExpectedDate, todayISO);
  const isIncome = row.direction === "income";

  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="truncate text-sm font-medium">{row.merchantName}</p>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {CADENCE_LABEL[row.cadence]}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {CATEGORY_LABELS[row.category]}
          </Badge>
          {row.source === "manual" && (
            <Badge variant="outline" className="text-[10px]">
              Manual
            </Badge>
          )}
        </div>
        <p className="text-sm tabular-nums">
          <span className={isIncome ? "text-green-700 dark:text-green-500" : ""}>
            {isIncome ? "+" : ""}{fmt(row.typicalAmountCents)}
          </span>
          {showRange && (
            <span className="text-xs text-muted-foreground">
              {" "}
              · range {fmt(row.minAmountCents)}–{fmt(row.maxAmountCents)}
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          Next expected {row.nextExpectedDate}
          {overdue > 0 && (
            <span className="text-yellow-700 dark:text-yellow-500"> · {overdue}d overdue</span>
          )}
          {row.legCount > 0 && (
            <>
              {" "}· {row.legCount} occurrence{row.legCount === 1 ? "" : "s"}
              {row.lastSeenDate && ` · last seen ${row.lastSeenDate}`}
            </>
          )}
          {row.confidence != null && row.source === "detected" && (
            <> · {Math.round(row.confidence * 100)}% conf</>
          )}
        </p>
      </div>
      <div className="shrink-0">
        <RowActions id={row.id} source={row.source} ignored={row.ignored} />
      </div>
    </li>
  );
}

function AdditionalIncomeListItem({ row }: { row: AdditionalIncomeRow }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{row.merchantName ?? row.description}</p>
        <p className="text-xs text-muted-foreground">{row.transactionDate}</p>
      </div>
      <p className="tabular-nums text-green-700 dark:text-green-500">
        +{fmt(row.amountCents)}
      </p>
    </li>
  );
}

function daysOverdue(nextExpected: string, todayISO: string): number {
  if (nextExpected >= todayISO) return 0;
  return daysBetween(nextExpected, todayISO);
}

/**
 * Express any cadence as a per-month equivalent so headers can show a single
 * "you have $X/mo of recurring" number. Approximate.
 */
function monthlyEquivalentCents(r: RecurringRow): number {
  switch (r.cadence) {
    case "weekly":
      return Math.round((r.typicalAmountCents * 52) / 12);
    case "fortnightly":
      return Math.round((r.typicalAmountCents * 26) / 12);
    case "monthly":
      return r.typicalAmountCents;
    case "yearly":
      return Math.round(r.typicalAmountCents / 12);
  }
}
