# metriX

Personal finance app for AU bank accounts. Connects via Basiq, categorises transactions with Gemini, and answers questions like "can I afford $200 on dinner tonight?" against your real budget state.

The aim is something proactive — a daily briefing, anomaly alerts, recurring-charge tracking, and a 60-day cashflow forecast — rather than another dashboard of charts.

## Stack

Next.js 16 · TypeScript · Tailwind v4 + shadcn/ui · Supabase (Postgres + Auth + RLS) · Drizzle · Basiq · Gemini 3 Flash (`@google/genai`) · Recharts · Vercel + Vercel Cron.

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase, Basiq, Gemini, CRON_SECRET
pnpm db:migrate              # apply Drizzle migrations to Supabase
pnpm dev
```

You'll need a Supabase project (free tier), a Basiq sandbox key, and a Gemini API key from [AI Studio](https://aistudio.google.com/apikey). For Vercel deploys, generate `CRON_SECRET` with `openssl rand -hex 32` so the daily cron handler can authenticate itself.

## Scripts

| | |
| --- | --- |
| `pnpm dev` | dev server (Turbopack) |
| `pnpm build` / `pnpm start` | production build / serve |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit` |
| `pnpm test` | Vitest |
| `pnpm db:generate` / `db:migrate` / `db:studio` | Drizzle |

## Layout

- `app/(auth)` – login, signup, auth callback
- `app/(app)` – dashboard, transactions, budgets, subscriptions, trends, chat, settings, onboarding
- `app/api/basiq` – connect callback · `app/api/cron/sync` – daily sync (Vercel Cron) · `app/api/agent` – streaming chat
- `lib/basiq` – REST client, sync, transfer detection
- `lib/merchants` – alias → trigram fuzzy → batched Gemini resolver
- `lib/recurring` – cadence-based recurring detector (paychecks + bills)
- `lib/cashflow` – 60-day forward simulator
- `lib/alerts` – anomaly + price-change + pending-interception scanners
- `lib/agent` – Gemini tool-use loop and daily briefing
- `lib/db/schema.ts` – Drizzle schema (source of truth, RLS enforced per-user)
- `proxy.ts` – Next.js 16 proxy that refreshes Supabase sessions and gates `/(app)` routes
