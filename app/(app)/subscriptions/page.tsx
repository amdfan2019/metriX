import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchUserRecurring, type RecurringRow } from "@/lib/recurring/queries";
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
  const all = await fetchUserRecurring();
  const today = todaySydney();

  const active = all.filter((r) => r.status === "active" && !r.ignored);
  const inactive = all.filter((r) => r.status === "inactive" && !r.ignored);
  const ignored = all.filter((r) => r.ignored);

  const totalActiveMonthly = active.reduce((sum, r) => sum + monthlyEquivalentCents(r), 0);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subscriptions & recurring</h1>
          <p className="text-sm text-muted-foreground">
            {all.length === 0
              ? "Detect or enter recurring charges so we can plan ahead."
              : `${active.length} active · ${inactive.length} inactive · ${ignored.length} ignored · ${fmt(totalActiveMonthly)}/mo equivalent`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RescanButton />
          <AddSubscriptionForm />
        </div>
      </header>

      {active.length > 0 && (
        <Section title="Active" description="We expect these to charge again.">
          <SubscriptionList rows={active} todayISO={today} />
        </Section>
      )}

      {inactive.length > 0 && (
        <Section
          title="Inactive"
          description="We haven't seen one of these in over a cadence — possibly cancelled."
        >
          <SubscriptionList rows={inactive} todayISO={today} muted />
        </Section>
      )}

      {ignored.length > 0 && (
        <Section
          title="Ignored"
          description="You marked these as not recurring. They're skipped from forecasts."
        >
          <SubscriptionList rows={ignored} todayISO={today} muted />
        </Section>
      )}

      {all.length === 0 && (
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
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
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
  // Show the range only when amounts genuinely vary (>5% or >$1 absolute).
  const showRange = variance > Math.max(100, row.typicalAmountCents * 0.05);
  const overdue = daysOverdue(row.nextExpectedDate, todayISO);

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
          {fmt(row.typicalAmountCents)}
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

function daysOverdue(nextExpected: string, todayISO: string): number {
  if (nextExpected >= todayISO) return 0;
  return daysBetween(nextExpected, todayISO);
}

/**
 * Express any cadence as a per-month equivalent so the page header can show
 * a single "you have $X/mo of recurring" number. Approximate; matches what a
 * user would intuitively expect (yearly /12, fortnightly *26/12, etc).
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
