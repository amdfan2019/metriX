# Project: metriX — Personal Finance Agent

## What we're building

A web app that connects to a user's bank accounts via Basiq, ingests transactions, resolves cryptic merchant descriptions into human-readable categorized entries, tracks spending against per-category budgets, and exposes an AI agent (Gemini 3 Flash via Vertex AI) that can answer natural-language questions like "can I afford $200 on dinner tonight?" using real budget state via function calling.

The user is in Sydney, Australia. Primary target is AU bank accounts (including Wise AU) via Basiq's Consumer Data Right integration.

## Core features for v1 (this milestone)

1. **Auth**: email/password via Supabase Auth. One user per account for now, no sharing.
2. **Bank connection**: Basiq Connect flow. User clicks "Connect bank," gets redirected to Basiq's hosted consent UI, comes back, we store their Basiq user ID and poll for transactions.
3. **Transaction ingestion**: pull transactions from Basiq on connection and on a daily cron. Store in Postgres, normalized.
4. **Merchant resolution**:
   - Each raw transaction description (e.g. `IHMC GREEN SQUARE PTY LTD`) is resolved to a canonical merchant + category.
   - Resolution pipeline: (a) check `merchant_aliases` table for exact match on raw_description; (b) if miss, check fuzzy match (trigram similarity); (c) if still miss, call Gemini 3 Flash with structured output (JSON schema) to propose `{merchant_name, category, confidence}`; (d) if confidence < 0.8, mark transaction as "needs review" and surface in UI; (e) when user confirms or corrects, write the raw_description → merchant → category mapping into `merchant_aliases` so it's deterministic next time.
   - Categories are a fixed enum for v1: `groceries`, `dining`, `rent`, `utilities`, `transport`, `entertainment`, `shopping`, `health`, `subscriptions`, `income`, `transfer`, `other`.
   - **In v1, Gemini-based resolution runs only when the user explicitly clicks "Run categorization" on the Transactions page** (cost control + visibility).
5. **Budgets**: user sets a monthly cap per category. Dashboard shows current month's spend per category with progress bars and a "projected month-end" figure (simple linear projection from days elapsed). On first connect, defaults pre-fill from `median(last 90 days) × 1.1` per category.
6. **Alerts**: in-app banner when any category crosses 80% or 100% of budget. Pending-transaction interception flags transactions that would tip a category over while still pending. Email alerts are nice-to-have, skip for v1.
7. **AI agent chat**: a chat interface on the dashboard where the user can ask questions. Powered by Gemini 3 Flash via Vertex AI with function calling. Tools the agent can call:
   - `get_budget_status(month?)` → returns per-category spend vs. budget
   - `get_recent_transactions(category?, days?, limit?)` → returns transactions
   - `get_spending_by_category(start_date, end_date)` → aggregated totals
   - `project_month_end(category?)` → projected spend at current pace
   - `can_i_afford(amount, category)` → computes remaining budget in category, considers detected pending recurring expenses for the rest of the month, returns a structured yes/no/stretch answer with reasoning
   - `find_trends(category?, months?)` → month-over-month change, unusual spikes
8. **Trends view**: a simple page showing last-6-months spend per category as line/bar charts.
9. **Recurring expense detection**: scan history for repeating patterns (same merchant, ~monthly cadence, similar amount). Powers the Subscriptions view, missed-bill alerts, price-change detection, and accurate `can_i_afford`.
10. **Daily Gemini-written briefing card** on the dashboard: a CFO-style read of the week (burn rate, anomalies, what to watch).

## Explicit non-goals for v1

- No mobile app. Web only, but responsive.
- No multi-currency handling beyond AUD. Wise AU foreign-currency transactions are stored at the AUD figure Basiq returns; FX leg ignored.
- No shared/family accounts.
- No bill prediction beyond "expected next billing date" from recurring detection.
- No CSV upload yet (v2).
- No receipt photo ingestion yet (v2).

## Stack (non-negotiable unless flagged as a real problem)

- **Framework**: Next.js (latest stable — currently 16) with App Router, TypeScript, React Server Components where sensible. Note: Next 16 renamed `middleware.ts` → `proxy.ts`.
- **Styling**: Tailwind CSS v4 + shadcn/ui (base-nova preset, neutral base color)
- **Auth + DB**: Supabase (Postgres + Auth). Use Supabase's Row Level Security so all queries are user-scoped by default.
- **ORM**: Drizzle (snake_case casing)
- **AI**: Google Gemini 3 Flash via Vertex AI Node SDK (`@google-cloud/vertexai`). Function calling for the agent, responseSchema/JSON mode for merchant categorization.
- **Banking**: Basiq API v3 (sandbox for dev).
- **Charts**: Recharts
- **Cron**: Vercel Cron for daily transaction sync
- **Deploy target**: Vercel
- **Package manager**: pnpm
- **Node**: 20 LTS

## Repo structure

```
/app
  /(auth)        — login, signup, auth callback
  /(app)         — authed routes
    /dashboard
    /transactions
    /budgets
    /trends
    /chat
    /settings
  /api
    /basiq       — connect, webhook, sync endpoints
    /agent       — chat endpoint, streams Gemini responses
    /cron        — daily sync
/lib
  /basiq         — Basiq client wrapper
  /gemini        — Gemini client, tool definitions, agent loop
  /db            — Drizzle schema, queries
  /merchants     — resolution pipeline
  /budgets       — budget calc logic
/components      — shadcn components + app components
/docs            — ARCHITECTURE.md, PRD.md, this prompt saved as PROMPT.md
proxy.ts         — Next 16 file convention (was middleware.ts in 15)
```

## Working agreement

1. **Vertical slices, not horizontal layers.** Each slice deploys end-to-end before the next starts.
2. **Ask before doing.** Clarifying questions and a build order before any code on a new feature.
3. **Stop and confirm** before: making schema changes after v1 is done, adding new dependencies beyond the stack above, touching billing/production Basiq (stay in sandbox), or spending real Vertex AI quota on large batch operations.
4. **Tests**: Vitest for the merchant resolver and budget calc logic. Don't bother unit-testing UI components.
5. **Secrets**: never hardcode. `.env.example` lists every variable needed; values come from the user.

## Confirmed answers (from the planning session)

- **Auth**: Supabase (lean into RLS, single auth path).
- **Chat history**: persisted per-user in DB.
- **Default budgets**: pre-filled from median spend × 1.1 on first connect; user can edit.
- **Historical window on first connect**: 90 days.
- **Pending vs posted**: ingest both; pending used for early-warning interception.
- **Wise AU FX**: store at the AUD figure Basiq returns, ignore FX leg.
- **Recurring detection**: yes — built in Slice 5, used by `can_i_afford` and missed-bill alerts.
- **Tool-call debug panel**: yes — built alongside the chat.
- **Merchant resolution**: batched (≈20 txns per Gemini call), and in v1 only runs when the user presses "Run categorization."
- **Transfers/duplicates**: detect mirror-image pairs across the user's accounts (matching amount + opposing sign + date ±2 days, plus description heuristics like "PAYMENT", "TRANSFER", "BPAY", "INTERNAL"). Tag both legs as `transfer` category and exclude from budget math. Credit-card payments handled the same way.

## Slice plan

1. **Skeleton on Vercel** — Next.js + Tailwind + shadcn + Supabase Auth + empty dashboard, deployed.
2. **Budgets without bank data** — Schema with RLS, budget setup UI, dev seed-data button, dashboard with progress bars + projection, in-app alerts, Vitest.
3. **Basiq sandbox connect** — Connect flow, transactions table populated, dedup, daily cron, transfer detection.
4. **User-triggered merchant resolution** — Alias → trigram fuzzy → batched Gemini. Needs-review queue. On confirm, write to aliases.
5. **Recurring expense detector** — Scan transactions, persist to `recurring_expenses`. Subscriptions view. Powers `can_i_afford` and missed-bill alerter.
6. **AI agent + briefing card** — `/chat` with streaming Gemini, all 6 tools wired, tool-call debug panel, persisted history. Dashboard hero becomes the daily Gemini-written briefing.
7. **Anomaly + pending alerts** — Pending interception, statistical anomaly detector, price-change detector on recurring bills. Surfaces as in-app cards.
8. **Trends + polish** — Recharts trends page, settings, mobile pass.
