import type { Cadence } from "@/lib/db/schema";

// Bracket of acceptable day-gaps between consecutive legs for each cadence.
// Wide enough to absorb weekend shifts, public holidays, and "month-end" billing
// jitter (Feb is 28-29 days, May is 31, etc) without bleeding into the next
// bucket. Buckets do not overlap.
export const CADENCE_WINDOWS: Record<Cadence, { minDays: number; maxDays: number; centerDays: number }> = {
  weekly: { minDays: 6, maxDays: 8, centerDays: 7 },
  fortnightly: { minDays: 12, maxDays: 16, centerDays: 14 },
  monthly: { minDays: 27, maxDays: 34, centerDays: 30 },
  yearly: { minDays: 350, maxDays: 380, centerDays: 365 },
};

export const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  yearly: "Yearly",
};

/** Days between two YYYY-MM-DD dates. Sign-positive only. */
export function daysBetween(a: string, b: string): number {
  const ma = Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)));
  const mb = Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10)));
  return Math.round(Math.abs(ma - mb) / 86400000);
}

/** Adds `days` to a YYYY-MM-DD date, returning a YYYY-MM-DD date. */
export function addDays(iso: string, days: number): string {
  const ms = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const d = new Date(ms + days * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function gapMatchesCadence(gapDays: number, cadence: Cadence): boolean {
  const w = CADENCE_WINDOWS[cadence];
  return gapDays >= w.minDays && gapDays <= w.maxDays;
}

/** Day of month, 1..31. */
export function monthDay(iso: string): number {
  return Number(iso.slice(8, 10));
}

/** Day of week, 0=Sun..6=Sat. */
export function dayOfWeek(iso: string): number {
  const d = new Date(
    Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))),
  );
  return d.getUTCDay();
}

/** Day of year, 1..366. */
export function dayOfYear(iso: string): number {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const start = Date.UTC(year, 0, 1);
  const cur = Date.UTC(year, month - 1, day);
  return Math.round((cur - start) / 86400000) + 1;
}
