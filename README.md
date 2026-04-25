# metriX

AI-first personal finance tracker. Connects to AU bank accounts via Basiq, categorises transactions with Gemini, and surfaces proactive insights (burn rate, anomalies, recurring subscriptions, can-I-afford-this-tonight) instead of just charts.

See [`docs/PROMPT.md`](./docs/PROMPT.md) for the full project brief and slice plan.

## Status

**Slice 3 — Basiq sandbox connect.** Auth + budgets dashboard + bank connection flow with daily cron sync and transfer detection across user accounts. Merchant resolution (Slice 4) and the AI agent (Slice 6) are next.

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
# fill in Supabase + Basiq values; Vertex/Cron are needed for later slices
```

### 3a. Configure Basiq (Slice 3+)

1. Sign up at [dashboard.basiq.io](https://dashboard.basiq.io) (free sandbox).
2. **API Keys → Create** with `SERVER_ACCESS` scope. Copy the key into `BASIQ_API_KEY`.

That's it. We pass `success=` / `error=` query params on the Consent UI URL at request time, so no Basiq application-level redirect URL config is needed.

### 3b. Generate a `CRON_SECRET` (Slice 3+)

```bash
openssl rand -hex 32
```

Copy the output into `CRON_SECRET` locally and in Vercel. Vercel Cron sends this as a Bearer token to the cron handler so unauthorised hits get rejected.

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
- `app/api/basiq/` — Basiq Connect callback
- `app/api/cron/sync/` — daily transaction sync (Vercel Cron)
- `lib/basiq/` — REST client, sync logic, transfer detection
- `lib/budgets/` — calc + Supabase queries
- `lib/supabase/` — server, browser, admin (service-role) clients
- `lib/db/` — Drizzle schema (source of truth for migrations)
- `drizzle/` — generated migration SQL (apply via Supabase SQL Editor)
- `proxy.ts` — Next.js 16 proxy that refreshes Supabase sessions and gates `/(app)` routes
