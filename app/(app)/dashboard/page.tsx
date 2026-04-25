import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchUserBudgets, fetchCurrentMonthTransactions } from "@/lib/budgets/queries";
import {
  budgetStatus,
  currentMonthSpend,
  projectMonthEnd,
  todaySydney,
  type BudgetStatus,
} from "@/lib/budgets/calc";
import type { Category } from "@/lib/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DevToolsBar } from "./dev-tools-bar";

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
  const greeting = user?.email?.split("@")[0] ?? "there";

  const today = todaySydney();
  const [budgets, txns] = await Promise.all([
    fetchUserBudgets(),
    fetchCurrentMonthTransactions(today),
  ]);

  const spend = currentMonthSpend(txns, today);

  const rows = budgets
    .map((b) => {
      const spent = spend[b.category] ?? 0;
      const projected = projectMonthEnd(spent, today);
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
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Good morning, {greeting}</h1>
          <p className="text-sm text-muted-foreground">
            {hasBudgets
              ? `Today is ${today}. Tracking ${rows.length} categor${rows.length === 1 ? "y" : "ies"}.`
              : "Set your monthly budgets to start tracking."}
          </p>
        </div>
        <Badge variant="secondary">Slice 2 · budgets</Badge>
      </header>

      {isDev && <DevToolsBar />}

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
          <CardDescription>
            A daily Gemini-written summary will live here once Slice 6 lands. For now, the alert card above is your read.
          </CardDescription>
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
              <Card key={r.category}>
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
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
