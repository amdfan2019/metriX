import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
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

// Fixed category set. Adding new values requires a migration; we treat this
// as a slow-changing axis.
//
// Categories are SUBSTANCE buckets. "Subscriptions" deliberately isn't here:
// recurring billing is a behaviour, not a category — a gym subscription is
// health, a streaming subscription is entertainment, cloud storage is other.
// The `recurring_expenses` table + /subscriptions page handle the behavioural
// grouping orthogonally.
export const CATEGORY_VALUES = [
  "groceries",
  "dining",
  "housing",
  "utilities",
  "transport",
  "entertainment",
  "shopping",
  "health",
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

// Bank connection: one row per (user, Basiq connection).
// basiq_user_id is denormalised — Basiq has one user object per app user, but we
// copy that id onto each connection row to avoid a separate user_profiles table
// for one column.
export const bankConnections = pgTable(
  "bank_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    basiqUserId: text("basiq_user_id").notNull(),
    basiqConnectionId: text("basiq_connection_id").notNull(),
    institutionName: text("institution_name"),
    status: text("status").notNull().default("active"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bank_connections_user_basiq_uniq").on(t.userId, t.basiqConnectionId),
    pgPolicy("bank_connections_select_own", {
      for: "select",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("bank_connections_insert_own", {
      for: "insert",
      to: "authenticated",
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("bank_connections_update_own", {
      for: "update",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("bank_connections_delete_own", {
      for: "delete",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
  ],
).enableRLS();

// Negative amount_cents = outflow (spend). Positive = inflow (income/refund).
// category is nullable because the Gemini-driven merchant resolver fills it in later.
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    description: text("description").notNull(),
    category: categoryEnum("category"),
    amountCents: integer("amount_cents").notNull(),
    transactionDate: date("transaction_date").notNull(),
    // Basiq linkage — nullable so manually-seeded txns work alongside real ones.
    basiqTransactionId: text("basiq_transaction_id"),
    accountId: text("account_id"),
    pending: boolean("pending").notNull().default(false),
    isTransfer: boolean("is_transfer").notNull().default(false),
    // Populated by the merchant resolver:
    merchantName: text("merchant_name"),
    needsReview: boolean("needs_review").notNull().default(false),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    // Set when this txn is a leg of a detected recurring series.
    recurringExpenseId: uuid("recurring_expense_id").references(() => recurringExpenses.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transactions_user_date_idx").on(t.userId, t.transactionDate),
    // Postgres allows multiple NULLs in a regular unique index by default
    // (NULLS DISTINCT), so we don't need a partial predicate. A partial index
    // would also break ON CONFLICT upserts via PostgREST.
    uniqueIndex("transactions_basiq_id_uniq").on(t.basiqTransactionId),
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

// Source of the alias: who/what asserted that raw_description maps to this
// merchant + category. 'user' overrides everything else (manual confirmation
// or correction); 'gemini' is the LLM resolver's output.
export const aliasSourceEnum = pgEnum("alias_source", ["user", "gemini"]);

// Per-user mapping from a raw transaction description (as it appears on the
// statement) to a canonical merchant + category. Populated by the merchant
// resolver and by user confirmations from the needs-review queue.
export const merchantAliases = pgTable(
  "merchant_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    rawDescription: text("raw_description").notNull(),
    merchantName: text("merchant_name").notNull(),
    category: categoryEnum("category").notNull(),
    source: aliasSourceEnum("source").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("merchant_aliases_user_raw_uniq").on(t.userId, t.rawDescription),
    pgPolicy("merchant_aliases_select_own", {
      for: "select",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("merchant_aliases_insert_own", {
      for: "insert",
      to: "authenticated",
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("merchant_aliases_update_own", {
      for: "update",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("merchant_aliases_delete_own", {
      for: "delete",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
  ],
).enableRLS();

// Cadence buckets for recurring expense detection. We deliberately keep this a
// short fixed enum (vs. interval_days numeric) — easier to reason about, easier
// to render labels for, and real-world recurring expenses overwhelmingly fall
// into these buckets.
export const CADENCE_VALUES = ["weekly", "fortnightly", "monthly", "yearly"] as const;
export type Cadence = (typeof CADENCE_VALUES)[number];
export const cadenceEnum = pgEnum("cadence", CADENCE_VALUES);

// active = currently expected to recur. inactive = last_seen + cadence has passed
// long enough ago that we don't expect another leg without intervention. Kept
// (not deleted) so the user can see "this stopped" and the agent has historical context.
export const recurringStatusEnum = pgEnum("recurring_status", ["active", "inactive"]);

// detected = produced by the recurring scanner from real transactions.
// manual   = user added it themselves on the Subscriptions page.
export const recurringSourceEnum = pgEnum("recurring_source", ["detected", "manual"]);

// Recurring streams flow either out (subscriptions, bills, rent) or in
// (paychecks, regular freelance invoices, rental income). Detection logic is
// identical; this just records which way the money moves.
export const recurringDirectionEnum = pgEnum("recurring_direction", ["expense", "income"]);

// One row per detected (or user-entered) recurring series. typical_amount_cents
// is stored as a magnitude (positive). min/max capture amount variance — useful
// for utility bills that swing quarter-to-quarter. ignored=true means the user
// flagged this as a false positive; we keep the row so we don't re-detect it.
export const recurringExpenses = pgTable(
  "recurring_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    merchantName: text("merchant_name").notNull(),
    category: categoryEnum("category").notNull(),
    cadence: cadenceEnum("cadence").notNull(),
    typicalAmountCents: integer("typical_amount_cents").notNull(),
    minAmountCents: integer("min_amount_cents").notNull(),
    maxAmountCents: integer("max_amount_cents").notNull(),
    // Null for freshly-added manual entries with no observed history.
    firstSeenDate: date("first_seen_date"),
    lastSeenDate: date("last_seen_date"),
    nextExpectedDate: date("next_expected_date").notNull(),
    legCount: integer("leg_count").notNull().default(0),
    status: recurringStatusEnum("status").notNull().default("active"),
    source: recurringSourceEnum("source").notNull().default("detected"),
    direction: recurringDirectionEnum("direction").notNull().default("expense"),
    ignored: boolean("ignored").notNull().default(false),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Same merchant + same cadence + same direction collapses to one row.
    // Direction is part of the key so a merchant could (in theory) appear as
    // both an expense and an income series without colliding.
    uniqueIndex("recurring_expenses_user_merchant_cadence_dir_uniq").on(
      t.userId,
      t.merchantName,
      t.cadence,
      t.direction,
    ),
    pgPolicy("recurring_expenses_select_own", {
      for: "select",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("recurring_expenses_insert_own", {
      for: "insert",
      to: "authenticated",
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("recurring_expenses_update_own", {
      for: "update",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("recurring_expenses_delete_own", {
      for: "delete",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
  ],
).enableRLS();

// User-level settings. One row per user, keyed on user_id directly (no surrogate
// id) — there's never more than one settings record per user. monthly_income_cents
// holds the user's best estimate of monthly take-home; income detection surfaces
// "your detected income is X, you said Y" reconciliation rather than overwriting it.
// monthly_savings_target_cents is the user's monthly savings goal (defaults to
// 15-20% of income at onboarding; user can adjust).
export const userSettings = pgTable(
  "user_settings",
  {
    userId: uuid("user_id").primaryKey(),
    monthlyIncomeCents: integer("monthly_income_cents"),
    monthlySavingsTargetCents: integer("monthly_savings_target_cents"),
    // Cashflow simulator's "danger zone" floor. Any day projected to drop
    // below this triggers a cashflow risk alert. Defaults to $200 — a small
    // but concrete buffer so the user sees risk before hitting zero.
    cashflowBufferCents: integer("cashflow_buffer_cents").notNull().default(20000),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    pgPolicy("user_settings_select_own", {
      for: "select",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("user_settings_insert_own", {
      for: "insert",
      to: "authenticated",
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("user_settings_update_own", {
      for: "update",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("user_settings_delete_own", {
      for: "delete",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
  ],
).enableRLS();

// Chat with the AI agent. One rolling session per user today, but the schema
// supports multiple — a "New chat" button just inserts a new session row and
// we read from the latest.
export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("chat_sessions_user_updated_idx").on(t.userId, t.updatedAt),
    pgPolicy("chat_sessions_select_own", {
      for: "select",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("chat_sessions_insert_own", {
      for: "insert",
      to: "authenticated",
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("chat_sessions_update_own", {
      for: "update",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("chat_sessions_delete_own", {
      for: "delete",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
  ],
).enableRLS();

// Roles map to Gemini's content roles plus a synthetic 'tool' marker for the
// function-response side of a tool round-trip. We store user_id redundantly
// (also on chat_sessions) so RLS policies don't need a join.
export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant", "tool", "system"]);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: chatRoleEnum("role").notNull(),
    // Plain text content. Null when an assistant turn was pure tool-calls
    // with no narrative text, or for tool-response rows.
    content: text("content"),
    // For role='assistant': the function calls Gemini emitted in this turn.
    // Shape: [{ name: string, args: object }]
    toolCalls: jsonb("tool_calls"),
    // For role='tool': which tool this row is the response for, plus the JSON-
    // serialisable response payload.
    toolName: text("tool_name"),
    toolResponse: jsonb("tool_response"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("chat_messages_session_created_idx").on(t.sessionId, t.createdAt),
    pgPolicy("chat_messages_select_own", {
      for: "select",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("chat_messages_insert_own", {
      for: "insert",
      to: "authenticated",
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("chat_messages_delete_own", {
      for: "delete",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
  ],
).enableRLS();

// Daily Gemini-written briefing. One row per user per day; the dashboard
// reads today's row, the cron writes it after the daily Basiq sync.
export const dailyBriefings = pgTable(
  "daily_briefings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    briefingDate: date("briefing_date").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("daily_briefings_user_date_uniq").on(t.userId, t.briefingDate),
    pgPolicy("daily_briefings_select_own", {
      for: "select",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("daily_briefings_insert_own", {
      for: "insert",
      to: "authenticated",
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("daily_briefings_update_own", {
      for: "update",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("daily_briefings_delete_own", {
      for: "delete",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
  ],
).enableRLS();

// Account-level snapshots. One row per Basiq account. Latest balance only —
// no history kept. The cashflow simulator reads the current balance as its
// starting point for the forward projection.
//
// account_class.type is what Basiq returns ('transaction', 'savings', 'credit-
// card', 'loan', etc). The cashflow forecast sums `transaction` accounts only —
// savings shouldn't be drawn for daily flow, and credit cards are negative
// balances that increase as you spend (different math, not yet handled).
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    basiqAccountId: text("basiq_account_id").notNull(),
    basiqUserId: text("basiq_user_id").notNull(),
    institutionName: text("institution_name"),
    accountName: text("account_name"),
    accountNumber: text("account_number"),
    accountType: text("account_type"),
    accountClass: text("account_class"),
    currentBalanceCents: integer("current_balance_cents"),
    availableBalanceCents: integer("available_balance_cents"),
    currency: text("currency").notNull().default("AUD"),
    status: text("status").notNull().default("active"),
    balanceAsOf: timestamp("balance_as_of", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("accounts_user_basiq_uniq").on(t.userId, t.basiqAccountId),
    pgPolicy("accounts_select_own", {
      for: "select",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("accounts_insert_own", {
      for: "insert",
      to: "authenticated",
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("accounts_update_own", {
      for: "update",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("accounts_delete_own", {
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
export type BankConnection = typeof bankConnections.$inferSelect;
export type NewBankConnection = typeof bankConnections.$inferInsert;
export type MerchantAlias = typeof merchantAliases.$inferSelect;
export type NewMerchantAlias = typeof merchantAliases.$inferInsert;
export type RecurringExpense = typeof recurringExpenses.$inferSelect;
export type NewRecurringExpense = typeof recurringExpenses.$inferInsert;
export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;
export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type DailyBriefing = typeof dailyBriefings.$inferSelect;
export type NewDailyBriefing = typeof dailyBriefings.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

// Proactive alerts. The system raises these unprompted when anomaly detectors
// fire on each scan. Cards render on /dashboard; agent reads via get_alerts().
// Severity drives sort order and the briefing's lead.
export const alertKindEnum = pgEnum("alert_kind", [
  "transaction_anomaly", // single transaction unusually large for its (category, merchant) pair
  "price_change", // a recurring leg's amount differs >15% from typical
  "pending_over_budget", // pending txn would tip its category over the cap if it posts
  "income_late", // active income series whose next_expected_date is past and no leg matched
]);

export const alertSeverityEnum = pgEnum("alert_severity", ["info", "warn", "critical"]);

// `resolved` = the underlying condition went away (paycheck arrived, pending
// txn posted, anomaly is no longer recent). `dismissed` = user clicked dismiss.
// `snoozed` = user hid temporarily (snooze_until controls when it resurfaces).
export const alertStatusEnum = pgEnum("alert_status", [
  "open",
  "resolved",
  "dismissed",
  "snoozed",
]);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    kind: alertKindEnum("kind").notNull(),
    severity: alertSeverityEnum("severity").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    // Optional foreign keys to the source row. ON DELETE SET NULL so a
    // wipe-all on transactions / recurring doesn't violate FK constraints —
    // the alert just loses its link.
    sourceTransactionId: uuid("source_transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    sourceRecurringId: uuid("source_recurring_id").references(() => recurringExpenses.id, {
      onDelete: "set null",
    }),
    // Stable string key per anomaly so a re-scan doesn't duplicate; format is
    // kind-specific (see lib/alerts/scan.ts). Examples:
    //   "txn_anomaly:<txn_id>"
    //   "price_change:<series_id>:<new_amount_cents>"
    //   "pending_over_budget:<txn_id>"
    //   "income_late:<series_id>:<expected_date>"
    dedupKey: text("dedup_key").notNull(),
    status: alertStatusEnum("status").notNull().default("open"),
    snoozeUntil: timestamp("snooze_until", { withTimezone: true }),
    // Free-form JSON for whatever context the agent / UI needs that doesn't
    // fit body. Keeps the schema flexible without churning columns per kind.
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("alerts_user_dedup_uniq").on(t.userId, t.dedupKey),
    index("alerts_user_status_idx").on(t.userId, t.status),
    pgPolicy("alerts_select_own", {
      for: "select",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("alerts_insert_own", {
      for: "insert",
      to: "authenticated",
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("alerts_update_own", {
      for: "update",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
      withCheck: sql`(select auth.uid()) = ${t.userId}`,
    }),
    pgPolicy("alerts_delete_own", {
      for: "delete",
      to: "authenticated",
      using: sql`(select auth.uid()) = ${t.userId}`,
    }),
  ],
).enableRLS();

export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
export type AlertKind = (typeof alertKindEnum.enumValues)[number];
export type AlertSeverity = (typeof alertSeverityEnum.enumValues)[number];
export type AlertStatus = (typeof alertStatusEnum.enumValues)[number];
