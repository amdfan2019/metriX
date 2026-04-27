import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { todaySydney } from "@/lib/budgets/calc";
import { findTrends } from "@/lib/agent/tools/find-trends";
import { buildCashflowForecast } from "@/lib/cashflow/queries";
import { CATEGORY_VALUES, type Category } from "@/lib/db/schema";
import { CashflowForecastChart, MonthlyOutflowChart, CategoryTrendChart } from "./charts";

const NON_SPEND = new Set<Category>(["income", "transfer"]);

export default async function TrendsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = todaySydney();
  const [trends, forecast] = await Promise.all([
    findTrends(supabase, user.id, { months: 12 }, today),
    buildCashflowForecast(today, { days: 60 }),
  ]);

  const months = trends.rows[0]?.months ?? [];
  // Pivot for the stacked bar: one row per month, one cents-key per category.
  const monthlyRows = months.map((m, i) => {
    const row: Record<string, string | number> = { month: m };
    for (const r of trends.rows) {
      row[r.category] = r.monthly_cents[i] ?? 0;
    }
    return row;
  });

  // Per-category series for the line chart drill-down. Pre-fetched so the
  // dropdown is instant — no round-trips on selection.
  const categorySeries = (CATEGORY_VALUES as readonly Category[])
    .filter((c) => !NON_SPEND.has(c))
    .map((c) => {
      const row = trends.rows.find((r) => r.category === c);
      return {
        category: c,
        points: months.map((m, i) => ({ month: m, cents: row?.monthly_cents[i] ?? 0 })),
      };
    });

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Trends</h1>
        <p className="text-sm text-muted-foreground">
          Cashflow projection plus 6–12 months of spending history.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cashflow forecast — next 60 days</CardTitle>
          <CardDescription>
            {forecast
              ? `Starting at ${fmtCents(forecast.startBalanceCents)}, projecting forward day-by-day with detected recurring streams + your variable-spend baseline. Dashed line is the ${fmtCents(forecast.bufferCents)} buffer.`
              : "Connect a bank to enable the cashflow forecast."}
          </CardDescription>
        </CardHeader>
        {forecast && (
          <CardContent>
            <CashflowForecastChart
              points={forecast.forecast.map((d) => ({
                date: d.date,
                balance_cents: d.projectedBalanceCents,
              }))}
              riskDates={forecast.riskDays.map((r) => r.date)}
              bufferCents={forecast.bufferCents}
            />
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Monthly outflow by category — last 12 months</CardTitle>
          <CardDescription>
            Stacked bars; hover for the per-category breakdown. Income, transfers, and savings/
            investment account flows are excluded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyOutflowChart data={monthlyRows} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Single-category trend</CardTitle>
          <CardDescription>
            Pick a category to see how it&apos;s moved month-over-month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryTrendChart series={categorySeries} />
        </CardContent>
      </Card>
    </div>
  );
}

function fmtCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
