import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Cadence } from "@/lib/db/schema";
import { addDays, daysBetween } from "@/lib/recurring/cadence";
import {
  baselineVariableSpend,
  findRiskDays,
  simulateCashflow,
  type ForecastDay,
  type RecurringStreamInput,
  type RiskDay,
} from "./simulate";

export interface AccountRow {
  id: string;
  basiqAccountId: string;
  accountName: string | null;
  accountNumber: string | null;
  accountType: string | null;
  /**
   * Basiq's class.type — 'transaction' / 'savings' / 'credit-card' / 'loan' /
   * 'mortgage' / 'investment'. Drives whether this account counts toward the
   * "spendable" pool used by the cashflow forecast.
   */
  accountClass: string | null;
  institutionName: string | null;
  currentBalanceCents: number | null;
  availableBalanceCents: number | null;
  currency: string;
  status: string;
  balanceAsOf: string | null;
}

export async function fetchUserAccounts(): Promise<AccountRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select(
      "id, basiq_account_id, account_name, account_number, account_type, account_class, institution_name, current_balance_cents, available_balance_cents, currency, status, balance_as_of",
    )
    .order("account_class", { ascending: true })
    .order("account_name", { ascending: true });
  if (error) throw new Error(`fetchUserAccounts failed: ${error.message}`);
  return (data ?? []).map(rowToAccount);
}

function rowToAccount(r: Record<string, unknown>): AccountRow {
  return {
    id: r.id as string,
    basiqAccountId: r.basiq_account_id as string,
    accountName: (r.account_name as string | null) ?? null,
    accountNumber: (r.account_number as string | null) ?? null,
    accountType: (r.account_type as string | null) ?? null,
    accountClass: (r.account_class as string | null) ?? null,
    institutionName: (r.institution_name as string | null) ?? null,
    currentBalanceCents: (r.current_balance_cents as number | null) ?? null,
    availableBalanceCents: (r.available_balance_cents as number | null) ?? null,
    currency: r.currency as string,
    status: r.status as string,
    balanceAsOf: (r.balance_as_of as string | null) ?? null,
  };
}

/**
 * "Spendable balance" = sum of available (or current, fallback) balance across
 * `transaction`-class accounts. Savings, credit cards, mortgages, and loans
 * are excluded — they aren't drawn for daily flow, and credit-card balances
 * are negative-magnitude debt that would mislead the simulator.
 */
export function spendableBalanceCents(accounts: AccountRow[]): number {
  let total = 0;
  for (const a of accounts) {
    if (a.accountClass !== "transaction") continue;
    if (a.status !== "active" && a.status !== "available") continue;
    const cents = a.availableBalanceCents ?? a.currentBalanceCents ?? 0;
    total += cents;
  }
  return total;
}

export interface CashflowForecast {
  startBalanceCents: number;
  startDate: string;
  bufferCents: number;
  variableSpendCentsPerDay: number;
  forecast: ForecastDay[];
  riskDays: RiskDay[];
  /** Earliest risk date if any (string) — convenience for UI callouts. */
  firstRiskDate: string | null;
}

interface BuildForecastOptions {
  /** How many days ahead to project. Default 60 (the dashboard window). */
  days?: number;
}

/**
 * One-shot cashflow forecast for the signed-in user. Reads accounts,
 * recurring streams, and recent variable spend, then runs the simulator.
 *
 * Returns null when we lack the inputs (no accounts on file yet — common for
 * a freshly-onboarded user who hasn't connected a bank). Caller decides
 * whether to render the "no forecast yet" placeholder.
 */
export async function buildCashflowForecast(
  todayISO: string,
  options: BuildForecastOptions = {},
): Promise<CashflowForecast | null> {
  const supabase = await createClient();
  const days = options.days ?? 60;

  const [{ data: accountData, error: aErr }, { data: settingsData, error: sErr }, { data: recurringData, error: rErr }] = await Promise.all([
    supabase.from("accounts").select("*"),
    supabase.from("user_settings").select("cashflow_buffer_cents").maybeSingle(),
    supabase
      .from("recurring_expenses")
      .select(
        "id, merchant_name, cadence, direction, typical_amount_cents, next_expected_date, status, ignored",
      )
      .eq("status", "active")
      .eq("ignored", false),
  ]);
  if (aErr) throw new Error(`buildCashflowForecast: accounts fetch failed: ${aErr.message}`);
  if (sErr) throw new Error(`buildCashflowForecast: settings fetch failed: ${sErr.message}`);
  if (rErr) throw new Error(`buildCashflowForecast: recurring fetch failed: ${rErr.message}`);

  const accounts: AccountRow[] = (accountData ?? []).map(rowToAccount);
  if (accounts.length === 0) return null;

  const startBalanceCents = spendableBalanceCents(accounts);
  const bufferCents = (settingsData?.cashflow_buffer_cents as number | null) ?? 20000;

  const streams: RecurringStreamInput[] = (recurringData ?? []).map((r) => ({
    id: r.id as string,
    merchantName: r.merchant_name as string,
    cadence: r.cadence as Cadence,
    typicalAmountCents: r.typical_amount_cents as number,
    nextExpectedDate: r.next_expected_date as string,
    direction: r.direction as "expense" | "income",
  }));

  const variableSpendCentsPerDay = await computeVariableSpendBaseline(supabase, todayISO);

  const forecast = simulateCashflow({
    startBalanceCents,
    startDate: todayISO,
    streams,
    variableSpendCentsPerDay,
    days,
  });
  const riskDays = findRiskDays(forecast, bufferCents);
  return {
    startBalanceCents,
    startDate: todayISO,
    bufferCents,
    variableSpendCentsPerDay,
    forecast,
    riskDays,
    firstRiskDate: riskDays.length > 0 ? riskDays[0].date : null,
  };
}

/**
 * Compute a per-day spending baseline from the last 30 days of non-recurring,
 * non-transfer outflows. Buckets by date and takes the median to avoid letting
 * a single anomaly (e.g. the day rent posted) dominate the projection.
 *
 * Note we exclude transactions linked to a recurring series (via recurring_
 * expense_id) — those are already reflected in the simulator's stream events.
 */
async function computeVariableSpendBaseline(
  supabase: SupabaseClient,
  todayISO: string,
): Promise<number> {
  const since = addDays(todayISO, -30);
  const { data, error } = await supabase
    .from("transactions")
    .select("amount_cents, transaction_date, recurring_expense_id, is_transfer, category, pending")
    .gte("transaction_date", since)
    .lte("transaction_date", todayISO)
    .eq("is_transfer", false)
    .eq("pending", false);
  if (error) throw new Error(`computeVariableSpendBaseline failed: ${error.message}`);

  const byDate = new Map<string, number>();
  for (const r of data ?? []) {
    if (r.recurring_expense_id) continue;
    const cents = r.amount_cents as number;
    if (cents >= 0) continue; // outflows only
    const cat = r.category as string | null;
    if (cat === "transfer" || cat === "income") continue;
    const date = r.transaction_date as string;
    byDate.set(date, (byDate.get(date) ?? 0) + Math.abs(cents));
  }

  // Fill gap days with 0 — they should count toward the baseline (a $0 day is
  // legitimate data, not missing data). Using only present-day totals would
  // bias upward.
  const totalDays = Math.max(1, Math.round(daysBetween(since, todayISO)));
  const totals: number[] = [];
  for (let i = 0; i < totalDays; i++) {
    const date = addDays(since, i);
    totals.push(byDate.get(date) ?? 0);
  }
  return baselineVariableSpend(totals);
}

// Re-export the rich result types so UI/agent callers don't have to dig.
export type { ForecastDay, RiskDay };
