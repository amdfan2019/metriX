@AGENTS.md
@docs/PROMPT.md

## Quick orientation for future sessions

- Stack and slice plan live in `docs/PROMPT.md`. Read that first.
- This is **Next.js 16**: the file convention formerly called `middleware.ts` is now `proxy.ts` at the project root, and `cookies()` is async. The note in `AGENTS.md` is real — verify against `node_modules/next/dist/docs/` before assuming Next 15 conventions still apply.
- Auth flows through Supabase. `proxy.ts` calls `lib/supabase/middleware.ts#updateSession` on every request to refresh tokens and gate `/(app)` routes. Server clients in `lib/supabase/server.ts`, browser client in `lib/supabase/client.ts`.
- Drizzle uses snake_case casing. `lib/db/schema.ts` is empty in Slice 1 by design — Slice 2 adds tables.
- AI is Gemini 3 Flash via Vertex AI (`@google-cloud/vertexai`). Don't switch to Google AI Studio — the user has Vertex access and prefers it.
- Currency is AUD only. Timezone Australia/Sydney for any cron scheduling.
- Working agreement: vertical slices, ask clarifying questions and propose a build order before coding new features, never hardcode secrets.
