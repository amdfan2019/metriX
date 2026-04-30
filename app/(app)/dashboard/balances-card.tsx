import { TriangleAlert } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AccountRow, CashflowForecast } from "@/lib/cashflow/queries";

const aud = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});
const audPrecise = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 2,
});

const fmt = (cents: number) => aud.format(cents / 100);
const fmtPrecise = (cents: number) => audPrecise.format(cents / 100);

const ACCOUNT_CLASS_LABEL: Record<string, string> = {
  transaction: "Everyday",
  savings: "Savings",
  "credit-card": "Credit card",
  loan: "Loan",
  mortgage: "Mortgage",
  investment: "Investment",
};

interface BalancesCardProps {
  accounts: AccountRow[];
  forecast: CashflowForecast | null;
}

export function BalancesCard({ accounts, forecast }: BalancesCardProps) {
  if (accounts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Balances</CardTitle>
          <CardDescription>
            Connect a bank to see your current balances and a 60-day cashflow forecast.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const transactionAccounts = accounts.filter((a) => a.accountClass === "transaction");
  const otherAccounts = accounts.filter((a) => a.accountClass !== "transaction");

  return (
    <div className="space-y-3">
      {forecast?.firstRiskDate && (
        <RiskCallout forecast={forecast} />
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-baseline justify-between">
            <CardTitle className="text-base">Balances</CardTitle>
            {forecast && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {fmt(forecast.startBalanceCents)} spendable
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {transactionAccounts.length > 0 && (
            <ul className="divide-y">
              {transactionAccounts.map((a) => (
                <AccountListItem key={a.id} account={a} highlight />
              ))}
            </ul>
          )}
          {otherAccounts.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Other accounts (not in spendable / forecast)
              </p>
              <ul className="divide-y">
                {otherAccounts.map((a) => (
                  <AccountListItem key={a.id} account={a} />
                ))}
              </ul>
            </div>
          )}

          {forecast && <Sparkline forecast={forecast} />}
        </CardContent>
      </Card>
    </div>
  );
}

function AccountListItem({
  account,
  highlight = false,
}: {
  account: AccountRow;
  highlight?: boolean;
}) {
  const balance = account.availableBalanceCents ?? account.currentBalanceCents ?? 0;
  return (
    <li className="flex items-center justify-between gap-3 px-1 py-2">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-sm font-medium">{account.accountName ?? "Account"}</p>
          {account.accountClass && (
            <Badge variant="outline" className="text-[10px]">
              {ACCOUNT_CLASS_LABEL[account.accountClass] ?? account.accountClass}
            </Badge>
          )}
        </div>
        {account.accountNumber && (
          <p className="text-xs text-muted-foreground tabular-nums">{account.accountNumber}</p>
        )}
      </div>
      <p
        className={cn(
          "shrink-0 tabular-nums text-sm",
          highlight ? "font-medium" : "text-muted-foreground",
          balance < 0 && "text-destructive",
        )}
      >
        {fmtPrecise(balance)}
      </p>
    </li>
  );
}

function RiskCallout({ forecast }: { forecast: CashflowForecast }) {
  const risk = forecast.riskDays[0];
  return (
    <Card className="border-yellow-500/40 bg-yellow-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TriangleAlert className="size-4 text-yellow-700 dark:text-yellow-500" aria-hidden />
          Cashflow risk on {risk.date}
        </CardTitle>
        <CardDescription>
          At current pace, your spendable balance dips to{" "}
          <strong>{fmtPrecise(risk.projectedBalanceCents)}</strong> on {risk.date} — below your
          {" "}
          {fmt(risk.bufferCents)} buffer. Trigger:{" "}
          <strong>{risk.triggerLabel}</strong>.
          {forecast.riskDays.length > 1 && (
            <> {forecast.riskDays.length - 1} more risk day{forecast.riskDays.length - 1 === 1 ? "" : "s"} in the next {forecast.forecast.length} days.</>
          )}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

/**
 * Inline SVG sparkline of projected balance over the forecast window. Pure
 * static SVG — Recharts is reserved for the trends page. Reads the first 30
 * days of the forecast so the dashboard stays compact.
 */
function Sparkline({ forecast }: { forecast: CashflowForecast }) {
  const points = forecast.forecast.slice(0, 30);
  if (points.length === 0) return null;

  const width = 600;
  const height = 60;
  const pad = 4;

  const balances = points.map((p) => p.projectedBalanceCents);
  const min = Math.min(...balances, 0);
  const max = Math.max(...balances, forecast.bufferCents);
  const range = Math.max(1, max - min);

  const stepX = (width - pad * 2) / Math.max(1, points.length - 1);
  const yFor = (cents: number) =>
    height - pad - ((cents - min) / range) * (height - pad * 2);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${pad + i * stepX} ${yFor(p.projectedBalanceCents)}`)
    .join(" ");

  // Buffer line — y position of the configured cashflow_buffer_cents.
  const bufferY = yFor(forecast.bufferCents);
  const zeroY = yFor(0);

  return (
    <div className="space-y-1 pt-1">
      <div className="flex items-baseline justify-between text-[10px] text-muted-foreground">
        <span>Projected over next {points.length} days</span>
        <span className="tabular-nums">
          end ≈ {fmt(points[points.length - 1].projectedBalanceCents)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-14 w-full"
        aria-hidden
      >
        {/* Buffer line */}
        <line
          x1={pad}
          x2={width - pad}
          y1={bufferY}
          y2={bufferY}
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeDasharray="3 3"
          className="text-muted-foreground"
        />
        {/* Zero line — only shown when balance might cross it */}
        {min < 0 && (
          <line
            x1={pad}
            x2={width - pad}
            y1={zeroY}
            y2={zeroY}
            stroke="currentColor"
            strokeOpacity="0.4"
            className="text-destructive"
          />
        )}
        <path
          d={path}
          fill="none"
          strokeWidth="2"
          stroke="currentColor"
          className={cn(forecast.firstRiskDate ? "text-yellow-600" : "text-foreground/80")}
        />
      </svg>
    </div>
  );
}
