import type { Category } from "@/lib/db/schema";

export interface SeedTransaction {
  user_id: string;
  description: string;
  category: Category | null;
  amount_cents: number;
  transaction_date: string; // YYYY-MM-DD
}

interface Plan {
  daysAgo: number;
  category: Category;
  dollars: number; // negative for outflow
  description: string;
}

// Generates plausible Sydney-flavoured AUD transactions across the last ~60 days.
// Hardcoded (no randomness) so re-seeding produces identical data — easier to
// reason about in dev. Slice 3 will replace this with real Basiq data.
const PLAN: Plan[] = [
  // --- Income (positive amounts) — paychecks every 14 days ---
  { daysAgo: 2, category: "income", dollars: 4500, description: "ACME PTY LTD SALARY" },
  { daysAgo: 16, category: "income", dollars: 4500, description: "ACME PTY LTD SALARY" },
  { daysAgo: 30, category: "income", dollars: 4500, description: "ACME PTY LTD SALARY" },
  { daysAgo: 44, category: "income", dollars: 4500, description: "ACME PTY LTD SALARY" },
  { daysAgo: 58, category: "income", dollars: 4500, description: "ACME PTY LTD SALARY" },

  // --- Rent — monthly, ~1st of month ---
  { daysAgo: 5, category: "rent", dollars: -2400, description: "RENTAL PAYMENT 4 ALEXANDRIA" },
  { daysAgo: 35, category: "rent", dollars: -2400, description: "RENTAL PAYMENT 4 ALEXANDRIA" },

  // --- Groceries (~2x/week) ---
  { daysAgo: 1, category: "groceries", dollars: -78, description: "WOOLWORTHS NEWTOWN" },
  { daysAgo: 4, category: "groceries", dollars: -42, description: "ALDI MARRICKVILLE" },
  { daysAgo: 8, category: "groceries", dollars: -91, description: "WOOLWORTHS NEWTOWN" },
  { daysAgo: 11, category: "groceries", dollars: -55, description: "HARRIS FARM MKT" },
  { daysAgo: 15, category: "groceries", dollars: -68, description: "COLES NEWTOWN" },
  { daysAgo: 18, category: "groceries", dollars: -29, description: "ALDI MARRICKVILLE" },
  { daysAgo: 22, category: "groceries", dollars: -84, description: "WOOLWORTHS NEWTOWN" },
  { daysAgo: 25, category: "groceries", dollars: -47, description: "HARRIS FARM MKT" },
  { daysAgo: 29, category: "groceries", dollars: -62, description: "COLES NEWTOWN" },
  { daysAgo: 32, category: "groceries", dollars: -71, description: "WOOLWORTHS NEWTOWN" },
  { daysAgo: 36, category: "groceries", dollars: -38, description: "ALDI MARRICKVILLE" },
  { daysAgo: 40, category: "groceries", dollars: -89, description: "WOOLWORTHS NEWTOWN" },
  { daysAgo: 45, category: "groceries", dollars: -53, description: "HARRIS FARM MKT" },
  { daysAgo: 50, category: "groceries", dollars: -76, description: "COLES NEWTOWN" },

  // --- Dining out / coffee ---
  { daysAgo: 0, category: "dining", dollars: -22, description: "TOBYS ESTATE COFFEE" },
  { daysAgo: 1, category: "dining", dollars: -38, description: "REUBEN HILLS SURRY HILLS" },
  { daysAgo: 3, category: "dining", dollars: -15, description: "CAMPOS COFFEE" },
  { daysAgo: 5, category: "dining", dollars: -64, description: "MR WONG GEORGE ST" },
  { daysAgo: 7, category: "dining", dollars: -28, description: "BAR ITALIA NORTON ST" },
  { daysAgo: 9, category: "dining", dollars: -19, description: "TOBYS ESTATE COFFEE" },
  { daysAgo: 12, category: "dining", dollars: -42, description: "BLOODWOOD NEWTOWN" },
  { daysAgo: 14, category: "dining", dollars: -31, description: "EL JANNAH GRANVILLE" },
  { daysAgo: 16, category: "dining", dollars: -25, description: "REUBEN HILLS SURRY HILLS" },
  { daysAgo: 19, category: "dining", dollars: -56, description: "EATIE GREEN SQUARE" },
  { daysAgo: 21, category: "dining", dollars: -18, description: "CAMPOS COFFEE" },
  { daysAgo: 24, category: "dining", dollars: -72, description: "MR WONG GEORGE ST" },
  { daysAgo: 27, category: "dining", dollars: -34, description: "BAR ITALIA NORTON ST" },
  { daysAgo: 31, category: "dining", dollars: -22, description: "TOBYS ESTATE COFFEE" },
  { daysAgo: 38, category: "dining", dollars: -48, description: "BLOODWOOD NEWTOWN" },
  { daysAgo: 42, category: "dining", dollars: -15, description: "CAMPOS COFFEE" },
  { daysAgo: 47, category: "dining", dollars: -29, description: "EL JANNAH GRANVILLE" },
  { daysAgo: 53, category: "dining", dollars: -67, description: "EATIE GREEN SQUARE" },

  // --- Transport (Opal top-ups + ride-shares) ---
  { daysAgo: 2, category: "transport", dollars: -40, description: "TRANSPORT FOR NSW OPAL" },
  { daysAgo: 9, category: "transport", dollars: -22, description: "UBER TRIP HELP.UBER.COM" },
  { daysAgo: 13, category: "transport", dollars: -40, description: "TRANSPORT FOR NSW OPAL" },
  { daysAgo: 17, category: "transport", dollars: -28, description: "DIDI MOBILITY" },
  { daysAgo: 24, category: "transport", dollars: -40, description: "TRANSPORT FOR NSW OPAL" },
  { daysAgo: 33, category: "transport", dollars: -19, description: "UBER TRIP HELP.UBER.COM" },
  { daysAgo: 41, category: "transport", dollars: -40, description: "TRANSPORT FOR NSW OPAL" },
  { daysAgo: 52, category: "transport", dollars: -40, description: "TRANSPORT FOR NSW OPAL" },

  // --- Entertainment ---
  { daysAgo: 6, category: "entertainment", dollars: -42, description: "EVENT CINEMAS GEORGE ST" },
  { daysAgo: 20, category: "entertainment", dollars: -85, description: "OPERA HOUSE TICKETS" },
  { daysAgo: 41, category: "entertainment", dollars: -25, description: "ENMORE THEATRE" },

  // --- Shopping ---
  { daysAgo: 10, category: "shopping", dollars: -120, description: "UNIQLO PITT ST MALL" },
  { daysAgo: 26, category: "shopping", dollars: -68, description: "BUNNINGS WAREHOUSE" },
  { daysAgo: 48, category: "shopping", dollars: -200, description: "DAVID JONES" },

  // --- Health ---
  { daysAgo: 14, category: "health", dollars: -75, description: "CHEMIST WAREHOUSE" },
  { daysAgo: 38, category: "health", dollars: -160, description: "MEDICARE BULK BILL CLINIC" },

  // --- Subscriptions (recurring monthly) ---
  { daysAgo: 4, category: "subscriptions", dollars: -23.99, description: "NETFLIX.COM" },
  { daysAgo: 34, category: "subscriptions", dollars: -23.99, description: "NETFLIX.COM" },
  { daysAgo: 8, category: "subscriptions", dollars: -13.99, description: "SPOTIFY P0AB12" },
  { daysAgo: 38, category: "subscriptions", dollars: -13.99, description: "SPOTIFY P0AB12" },
  { daysAgo: 12, category: "subscriptions", dollars: -14.99, description: "APPLE.COM/BILL" },
  { daysAgo: 42, category: "subscriptions", dollars: -14.99, description: "APPLE.COM/BILL" },
  { daysAgo: 6, category: "subscriptions", dollars: -4.49, description: "GOOGLE STORAGE" },
  { daysAgo: 36, category: "subscriptions", dollars: -4.49, description: "GOOGLE STORAGE" },

  // --- Utilities ---
  { daysAgo: 18, category: "utilities", dollars: -180, description: "AGL SALES PTY LTD" },
  { daysAgo: 48, category: "utilities", dollars: -110, description: "SYDNEY WATER CORP" },

  // --- Transfers (excluded from category burn) ---
  { daysAgo: 7, category: "transfer", dollars: -500, description: "TRANSFER TO SAVINGS" },
  { daysAgo: 28, category: "transfer", dollars: -500, description: "TRANSFER TO SAVINGS" },
];

function isoDateNDaysAgo(daysAgo: number, todayISO: string): string {
  const [y, m, d] = todayISO.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) - daysAgo * 86400000;
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function buildSeedTransactions(userId: string, todayISO: string): SeedTransaction[] {
  return PLAN.map((p) => ({
    user_id: userId,
    description: p.description,
    category: p.category,
    amount_cents: Math.round(p.dollars * 100),
    transaction_date: isoDateNDaysAgo(p.daysAgo, todayISO),
  }));
}
