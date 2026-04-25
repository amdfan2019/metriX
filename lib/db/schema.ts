import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// user_id holds Supabase auth.users.id (a uuid). We deliberately don't declare a
// foreign key — Supabase owns the auth schema, and RLS policies (below) provide
// the actual isolation. This matches Supabase's recommended pattern.

// Fixed v1 category set. Adding new values requires a migration; we treat this as a slow-changing axis.
export const CATEGORY_VALUES = [
  "groceries",
  "dining",
  "rent",
  "utilities",
  "transport",
  "entertainment",
  "shopping",
  "health",
  "subscriptions",
  "income",
  "transfer",
  "other",
] as const;
export type Category = (typeof CATEGORY_VALUES)[number];

export const categoryEnum = pgEnum("category", CATEGORY_VALUES);

// Per-user, per-category monthly cap.
export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    category: categoryEnum("category").notNull(),
    monthlyCapCents: integer("monthly_cap_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("budgets_user_category_uniq").on(t.userId, t.category),
    pgPolicy("budgets_select_own", {
      for: "select",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("budgets_insert_own", {
      for: "insert",
      to: "authenticated",
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("budgets_update_own", {
      for: "update",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("budgets_delete_own", {
      for: "delete",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
  ],
).enableRLS();

// Negative amount_cents = outflow (spend). Positive = inflow (income/refund).
// category is nullable in v1 because Slice 4's Gemini-driven resolver fills it in later.
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    description: text("description").notNull(),
    category: categoryEnum("category"),
    amountCents: integer("amount_cents").notNull(),
    transactionDate: date("transaction_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transactions_user_date_idx").on(t.userId, t.transactionDate),
    pgPolicy("transactions_select_own", {
      for: "select",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("transactions_insert_own", {
      for: "insert",
      to: "authenticated",
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("transactions_update_own", {
      for: "update",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("transactions_delete_own", {
      for: "delete",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
  ],
).enableRLS();

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
