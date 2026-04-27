import Link from "next/link";
import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  fetchUserBudgets,
  fetchCurrentMonthTransactions,
  fetchRecurringSpentByCategory,
} from "@/lib/budgets/queries";
import {
  budgetStatus,
  currentMonthSpend,
  projectMonthEndSmart,
  todaySydney,
  type BudgetStatus,
} from "@/lib/budgets/calc";
import { fetchUserBudgetSettings } from "@/lib/budgets/income";
import {
  computeOverallHealth,
  type OverallStatus,
  type SavingsStatus,
} from "@/lib/budgets/overall";
import { expectedRemainingThisMonthByCategory } from "@/lib/recurring/queries";
import { fetchTodayBriefing } from "@/lib/agent/briefing";
import { fetchUserAccounts, buildCashflowForecast } from "@/lib/cashflow/queries";
import { fetchOpenAlerts } from "@/lib/alerts/queries";
import { displayName, timeOfDayGreeting } from "@/lib/utils/greeting";
import { BalancesCard } from "./balances-card";
import { AlertsCard } from "./alerts-card";
import type { Category } from "@/lib/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DevToolsBar } from "./dev-tools-bar";

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

const STATUS_ORDER: Record<BudgetStatus, number> = { over: 0, warn: 1, ok: 2 };

const STATUS_BAR_CLASS: Record<BudgetStatus, string> = {
  ok: "bg-foreground/80",
  warn: "bg-yellow-500",
  over: "bg-destructive",
};

const audWhole = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

function fmt(cents: number) {
  return audWhole.format(cents / 100);
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const name = displayName(user);
  const greeting = timeOfDayGreeting();

  const today = todaySydney();
  const settingsForRedirect = await fetchUserBudgetSettings();
  // First-time users land on /dashboard from auth callback; bounce to the
  // wizard if they haven't told us their income yet. Existing users with
  // income set never see this redirect.
  if (
    settingsForRedirect.monthlyIncomeCents == null ||
    settingsForRedirect.monthlyIncomeCents <= 0
  ) {
    redirect("/onboarding");
  }

  const briefing = user ? await fetchTodayBriefing(supabase, user.id) : null;
  const [
    budgets,
    txns,
    committedRemaining,
    recurringSpentByCategory,
    accounts,
    forecast,
    openAlerts,
  ] = await Promise.all([
    fetchUserBudgets(),
    fetchCurrentMonthTransactions(today),
    expectedRemainingThisMonthByCategory(today),
    fetchRecurringSpentByCategory(today),
    fetchUserAccounts(),
    buildCashflowForecast(today),
    fetchOpenAlerts(),
  ]);
  const settings = settingsForRedirect;

  const spend = currentMonthSpend(txns, today);
  const overall = computeOverallHealth({
    monthlyIncomeCents: settings.monthlyIncomeCents,
    monthlySavingsTargetCents: settings.monthlySavingsTargetCents,
    monthTransactions: txns,
    committedRemaining,
    todayISO: today,
  });

  const rows = budgets
    .map((b) => {
      const spent = spend[b.category] ?? 0;
      const projected = projectMonthEndSmart({
        spentCents: spent,
        recurringSpentCents: recurringSpentByCategory[b.category] ?? 0,
        upcomingCommittedCents: committedRemaining[b.category] ?? 0,
        todayISO: today,
      });
      const status = budgetStatus(spent, b.monthlyCapCents);
      const projectedStatus = budgetStatus(projected, b.monthlyCapCents);
      const pct = Math.min(100, Math.round((spent / b.monthlyCapCents) * 100));
      return { ...b, spent, projected, status, projectedStatus, pct };
    })
    .sort((a, b) => {
      const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (s !== 0) return s;
      return b.spent / b.monthlyCapCents - a.spent / a.monthlyCapCents;
    });

  const alerts = rows.filter((r) => r.status !== "ok" || r.projectedStatus !== "ok");
  const isDev = process.env.NODE_ENV !== "production";
  const hasBudgets = budgets.length > 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting}, {name}
        </h1>
        {!hasBudgets && (
          <p className="text-sm text-muted-foreground">
            Set your monthly budgets to start tracking.
          </p>
        )}
      </header>

      {isDev && <DevToolsBar />}

      <OnTrackCard
        status={overall.status}
        spentCents={overall.spentCents}
        committedCents={overall.committedCents}
        monthlyIncomeCents={overall.monthlyIncomeCents}
        flexibleRemainingCents={overall.flexibleRemainingCents}
        daysRemaining={overall.daysRemaining}
        perDayCents={overall.perDayCents}
        monthlySavingsTargetCents={overall.monthlySavingsTargetCents}
        savingsProgressCents={overall.savingsProgressCents}
        savingsStatus={overall.savingsStatus}
      />

      <AlertsCard alerts={openAlerts} />

      <BalancesCard accounts={accounts} forecast={forecast} />

      {alerts.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TriangleAlert className="size-4 text-destructive" aria-hidden />
              Heads up — {alerts.length} categor{alerts.length === 1 ? "y" : "ies"} need
              {alerts.length === 1 ? "s" : ""} attention
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1 text-sm">
              {alerts.map((r) => (
                <li key={r.category}>
                  <span className="font-medium">{CATEGORY_LABELS[r.category]}</span>:{" "}
                  {r.status === "over" ? (
                    <span className="text-destructive">
                      {fmt(r.spent)} of {fmt(r.monthlyCapCents)} — over budget
                    </span>
                  ) : r.status === "warn" ? (
                    <span className="text-yellow-700 dark:text-yellow-500">
                      at {r.pct}% of {fmt(r.monthlyCapCents)}
                    </span>
                  ) : (
                    <span className="text-yellow-700 dark:text-yellow-500">
                      on track for {fmt(r.projected)} — {fmt(r.projected - r.monthlyCapCents)} over by month-end
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s briefing</CardTitle>
          {briefing ? (
            <CardDescription className="whitespace-pre-wrap text-foreground">
              {briefing.content}
            </CardDescription>
          ) : (
            <CardDescription>No briefing yet for {today}.</CardDescription>
          )}
        </CardHeader>
      </Card>

      {!hasBudgets ? (
        <Card>
          <CardHeader>
            <CardTitle>No budgets yet</CardTitle>
            <CardDescription>
              Set monthly caps for each category to see burn rate and projections here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/budgets" className={buttonVariants()}>
              Set budgets
            </Link>
          </CardContent>
        </Card>
      ) : (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Budgets this month</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <Link
                key={r.category}
                href={`/transactions?category=${r.category}`}
                className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="h-full transition-colors hover:border-foreground/20 hover:bg-muted/30">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardDescription>{CATEGORY_LABELS[r.category]}</CardDescription>
                      {r.status !== "ok" && (
                        <Badge
                          variant={r.status === "over" ? "destructive" : "secondary"}
                          className="text-xs"
                        >
                          {r.status === "over" ? "Over" : `${r.pct}%`}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-lg">
                      {fmt(r.spent)}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        / {fmt(r.monthlyCapCents)}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full transition-all", STATUS_BAR_CLASS[r.status])}
                        style={{ width: `${r.pct}%` }}
                        aria-hidden
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Projecting {fmt(r.projected)} by month-end
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<OverallStatus, string> = {
  "on-track": "On track",
  tight: "Tight",
  over: "Over budget",
  "income-unset": "Set your income",
};

const STATUS_BADGE_CLASS: Record<OverallStatus, string> = {
  "on-track": "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  tight: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  over: "bg-destructive/15 text-destructive border-destructive/30",
  "income-unset": "bg-muted text-muted-foreground border-border",
};

const SAVINGS_LABEL: Record<SavingsStatus, string> = {
  "on-track": "Savings on track",
  behind: "Savings behind",
  "off-track": "Savings off track",
  unset: "",
};

const SAVINGS_BADGE_CLASS: Record<SavingsStatus, string> = {
  "on-track": "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  behind: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  "off-track": "bg-destructive/15 text-destructive border-destructive/30",
  unset: "",
};

function OnTrackCard({
  status,
  spentCents,
  committedCents,
  monthlyIncomeCents,
  flexibleRemainingCents,
  daysRemaining,
  perDayCents,
  monthlySavingsTargetCents,
  savingsProgressCents,
  savingsStatus,
}: {
  status: OverallStatus;
  spentCents: number;
  committedCents: number;
  monthlyIncomeCents: number | null;
  flexibleRemainingCents: number;
  daysRemaining: number;
  perDayCents: number;
  monthlySavingsTargetCents: number | null;
  savingsProgressCents: number | null;
  savingsStatus: SavingsStatus;
}) {
  // The dashboard redirects to /onboarding when income is unset, so this
  // branch only fires in odd corner cases (e.g. someone manually sets income
  // to zero on Settings).
  if (status === "income-unset") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Set your monthly income</CardTitle>
          <CardDescription>
            Once we know your income we can show whether you&apos;re on track this month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/settings" className={buttonVariants({ size: "sm" })}>
            Add income
          </Link>
        </CardContent>
      </Card>
    );
  }

  const used = spentCents + committedCents;
  const pct = monthlyIncomeCents
    ? Math.min(100, Math.round((used / monthlyIncomeCents) * 100))
    : 0;
  const barClass =
    status === "over"
      ? "bg-destructive"
      : status === "tight"
        ? "bg-yellow-500"
        : "bg-green-500";

  const showSavings = monthlySavingsTargetCents != null && monthlySavingsTargetCents > 0;
  const savingsPct =
    showSavings && savingsProgressCents != null && monthlySavingsTargetCents > 0
      ? Math.min(100, Math.round((savingsProgressCents / monthlySavingsTargetCents) * 100))
      : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">This month</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-xs", STATUS_BADGE_CLASS[status])}>
              {STATUS_LABEL[status]}
            </Badge>
            {showSavings && savingsStatus !== "unset" && (
              <Badge
                variant="outline"
                className={cn("text-xs", SAVINGS_BADGE_CLASS[savingsStatus])}
              >
                {SAVINGS_LABEL[savingsStatus]}
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          {flexibleRemainingCents >= 0
            ? `${fmt(flexibleRemainingCents)} flexible · ~${fmt(perDayCents)}/day for ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`
            : `${fmt(Math.abs(flexibleRemainingCents))} over income${committedCents > 0 ? " (counting upcoming recurring)" : ""}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full transition-all", barClass)}
              style={{ width: `${pct}%` }}
              aria-hidden
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {fmt(spentCents)} spent
            {committedCents > 0 && ` · ${fmt(committedCents)} upcoming recurring`}
            {monthlyIncomeCents != null && ` · of ${fmt(monthlyIncomeCents)} income`}
          </p>
        </div>
        {showSavings && monthlySavingsTargetCents && (
          <div className="space-y-1 rounded-md border border-dashed bg-muted/30 px-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Savings progress
              </span>
              <span className="tabular-nums">
                {fmt(savingsProgressCents ?? 0)} of {fmt(monthlySavingsTargetCents)}
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full transition-all",
                  savingsStatus === "on-track"
                    ? "bg-green-500"
                    : savingsStatus === "behind"
                      ? "bg-yellow-500"
                      : "bg-destructive",
                )}
                style={{ width: `${savingsPct}%` }}
                aria-hidden
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
