# Ledger

AI-first personal finance tracker. Connects to AU bank accounts via Basiq, categorises transactions with Gemini, and surfaces proactive insights (burn rate, anomalies, recurring subscriptions, can-I-afford-this-tonight) instead of just charts.

See [`docs/PROMPT.md`](./docs/PROMPT.md) for the full project brief and slice plan.

## Status

**Slice 1 — Skeleton.** Next.js + Tailwind + shadcn + Supabase Auth, empty dashboard deployable to Vercel. Budgets, Basiq, merchant resolution, and the agent come in later slices.

## Setup

### 1. Install

```bash
pnpm install
```

### 2. Create a Supabase project

1. Sign up at [supabase.com](https://supabase.com) (free tier is fine).
2. Create a new project. Pick a region close to Sydney (e.g. `ap-southeast-2`).
3. **Settings → API**: copy the Project URL, anon key, and service role key.
4. **Settings → Database → Connection string**: copy the **Transaction pooler** URI (port `6543`) for `DATABASE_URL`.
5. **Authentication → Providers → Email**: for dev, you can disable "Confirm email" so signups work without a mailbox round-trip.

### 3. Set env vars

```bash
cp .env.example .env.local
# fill in Supabase values; the rest can stay empty until later slices
```

### 4. Run

```bash
pnpm dev
```

Visit `http://localhost:3000`. You'll be redirected to `/login`. Create an account at `/signup`, then you land on `/dashboard`.

## Scripts

| Script | What |
| --- | --- |
| `pnpm dev` | Next.js dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:generate` | Drizzle: generate SQL from schema |
| `pnpm db:migrate` | Drizzle: apply migrations to the DB |
| `pnpm db:push` | Drizzle: push schema directly (dev only) |
| `pnpm db:studio` | Drizzle Studio |

## Layout

- `app/(auth)/` — login, signup, auth callback
- `app/(app)/` — authed routes (dashboard, transactions, budgets, trends, chat, settings)
- `app/api/` — basiq, agent, cron handlers (filled in Slices 3, 6, 3 respectively)
- `lib/supabase/` — server, browser, and proxy clients
- `lib/db/` — Drizzle schema and client
- `proxy.ts` — Next.js 16 proxy (formerly middleware) that refreshes Supabase sessions and gates `/(app)` routes
