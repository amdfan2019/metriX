"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Category } from "@/lib/db/schema";

const aud0 = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});
const fmt = (cents: number) => aud0.format(cents / 100);

const CATEGORY_COLOR: Record<Category, string> = {
  groceries: "#22c55e",
  dining: "#f97316",
  housing: "#3b82f6",
  utilities: "#06b6d4",
  transport: "#a855f7",
  entertainment: "#ec4899",
  shopping: "#eab308",
  health: "#ef4444",
  income: "#10b981",
  transfer: "#94a3b8",
  other: "#6b7280",
};

const CATEGORY_LABEL: Record<Category, string> = {
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

// =====================================================================
// Cashflow forecast — line over next 60 days
// =====================================================================

interface ForecastPoint {
  date: string;
  balance_cents: number;
}

export function CashflowForecastChart({
  points,
  riskDates,
  bufferCents,
}: {
  points: ForecastPoint[];
  riskDates: string[];
  bufferCents: number;
}) {
  if (points.length === 0) return null;
  const riskSet = new Set(riskDates);
  // Show every 5th tick on the X axis to avoid overlap.
  const tickEvery = Math.max(1, Math.floor(points.length / 8));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v: string) => v.slice(5)}
            interval={tickEvery - 1}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v: number) => fmt(v)}
            width={70}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }}
            contentStyle={{
              background: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelFormatter={(v) => String(v ?? "")}
            formatter={(v) => [fmt(Number(v) || 0), "Projected balance"]}
          />
          <ReferenceLine
            y={bufferCents}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4"
            ifOverflow="extendDomain"
            label={{
              value: `Buffer ${fmt(bufferCents)}`,
              fill: "hsl(var(--muted-foreground))",
              fontSize: 10,
              position: "insideBottomRight",
            }}
          />
          {points.some((p) => p.balance_cents < 0) && (
            <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeOpacity={0.5} />
          )}
          <Line
            type="monotone"
            dataKey="balance_cents"
            stroke={riskDates.length > 0 ? "#eab308" : "hsl(var(--foreground))"}
            strokeWidth={2}
            dot={(props: { cx?: number; cy?: number; payload?: ForecastPoint }) => {
              const date = props.payload?.date;
              if (!date || !riskSet.has(date)) {
                // Recharts requires a renderable element even when there's no
                // dot — return a zero-size SVG group. Recharts handles keying
                // internally, so no explicit key needed.
                return <g />;
              }
              return (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={4}
                  fill="hsl(var(--destructive))"
                />
              );
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// =====================================================================
// Monthly stacked outflow — bar chart, last 12 months
// =====================================================================

const STACKED_CATEGORIES: Category[] = [
  "housing",
  "utilities",
  "transport",
  "groceries",
  "dining",
  "shopping",
  "health",
  "entertainment",
  "other",
];

export function MonthlyOutflowChart({
  data,
}: {
  data: Array<Record<string, string | number>>;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No history yet.</p>;
  }
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v: string) => v.slice(2)}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v: number) => fmt(v)}
            width={70}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
            contentStyle={{
              background: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v, name) => [
              fmt(Number(v) || 0),
              CATEGORY_LABEL[name as Category] ?? String(name),
            ]}
          />
          {STACKED_CATEGORIES.map((c) => (
            <Bar key={c} dataKey={c} stackId="a" fill={CATEGORY_COLOR[c]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {STACKED_CATEGORIES.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-sm"
              style={{ background: CATEGORY_COLOR[c] }}
              aria-hidden
            />
            {CATEGORY_LABEL[c]}
          </span>
        ))}
      </div>
    </div>
  );
}

// =====================================================================
// Single-category trend — line chart with dropdown
// =====================================================================

interface CategorySeries {
  category: Category;
  points: Array<{ month: string; cents: number }>;
}

export function CategoryTrendChart({ series }: { series: CategorySeries[] }) {
  const initial = series.find((s) => s.category === "dining")?.category ?? series[0]?.category;
  const [selected, setSelected] = useState<Category | undefined>(initial);
  const points = series.find((s) => s.category === selected)?.points ?? [];

  const total = points.reduce((sum, p) => sum + p.cents, 0);
  const avg = points.length > 0 ? Math.round(total / points.length) : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value as Category)}
          className="h-8 rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {series.map((s) => (
            <option key={s.category} value={s.category}>
              {CATEGORY_LABEL[s.category]}
            </option>
          ))}
        </select>
        {points.length > 0 && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {points.length}-month avg: <span className="text-foreground">{fmt(avg)}</span>
          </p>
        )}
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v: string) => v.slice(2)}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v: number) => fmt(v)}
              width={70}
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }}
              contentStyle={{
                background: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(v) => [fmt(Number(v) || 0), selected ? CATEGORY_LABEL[selected] : ""]}
            />
            <Line
              type="monotone"
              dataKey="cents"
              stroke={selected ? CATEGORY_COLOR[selected] : "hsl(var(--foreground))"}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
