import { buildCashflowForecast } from "@/lib/cashflow/queries";

const DEFAULT_DAYS = 60;
const MAX_DAYS = 120;

/**
 * `get_cashflow_forecast(days?, return_events?)` — projects spendable balance
 * forward day-by-day for `days` days using current balance + active recurring
 * streams + recent variable-spend baseline. Returns risk days plus a
 * downsampled balance series so the model has enough context without flooding
 * the prompt.
 *
 * `return_events` defaults to false — we only include event detail per day if
 * the agent explicitly asks. Saves tokens on "are we OK?" questions.
 */
export async function getCashflowForecast(
  _supabase: import("@supabase/supabase-js").SupabaseClient,
  _userId: string,
  args: Record<string, unknown>,
  todayISO: string,
): Promise<unknown> {
  const daysArg = Number(args.days);
  const days = Number.isFinite(daysArg) && daysArg > 0
    ? Math.min(MAX_DAYS, Math.floor(daysArg))
    : DEFAULT_DAYS;
  const returnEvents = args.return_events === true;

  const result = await buildCashflowForecast(todayISO, { days });
  if (!result) {
    return {
      available: false,
      reason:
        "No accounts on file — connect a bank to enable cashflow forecasting, or this user is in dev with seed data only.",
    };
  }

  // Sample every Nth day for the balance series so we don't hand the model
  // 60+ entries for a single tool call. Keep risk days and key inflection
  // points uncondensed.
  const sampleEvery = days <= 14 ? 1 : days <= 30 ? 2 : 5;
  const balanceSeries = result.forecast
    .filter((_, i) => i % sampleEvery === 0 || i === result.forecast.length - 1)
    .map((d) => ({
      date: d.date,
      projected_balance_cents: d.projectedBalanceCents,
      ...(returnEvents
        ? {
            events: d.events.map((e) => ({
              type: e.type,
              amount_cents: e.amountCents,
              label: e.label,
            })),
          }
        : {}),
    }));

  return {
    available: true,
    today: result.startDate,
    start_balance_cents: result.startBalanceCents,
    buffer_cents: result.bufferCents,
    variable_spend_cents_per_day: result.variableSpendCentsPerDay,
    days_projected: result.forecast.length,
    risk_days: result.riskDays.map((r) => ({
      date: r.date,
      projected_balance_cents: r.projectedBalanceCents,
      trigger_label: r.triggerLabel,
      trigger_type: r.triggerType,
    })),
    first_risk_date: result.firstRiskDate,
    balance_series: balanceSeries,
  };
}
