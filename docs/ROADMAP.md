# metriX — roadmap

The product vision: a Palantir for personal finance. The user's complete financial reality (income, spend, balances, recurring streams, goals) feeds a system that **anticipates issues and recommends actions before they happen**. Every layer added must serve that bar — if a feature isn't proactive or doesn't sharpen the picture, it doesn't ship.

This roadmap supersedes the slice list in `PROMPT.md`. Slices 1-6 are complete; 7-12 are the path to feature-complete v1.

## Done

| # | Slice | Shipped |
|---|---|---|
| 1 | Skeleton on Vercel | Auth, app shell, deploy pipeline |
| 2 | Budgets without bank data | RLS schema, /budgets, projection, in-app alerts, dev seed |
| 3 | Basiq sandbox connect | OAuth handoff, transaction sync, transfer detection, daily cron |
| 4 | User-triggered merchant resolution | Alias → fuzzy → batched Gemini, needs-review queue |
| 5 | Recurring expense detector | Density / day-of-month / amount-stability gates, manual entry with auto-link, /subscriptions |
| 6 | AI agent + briefing card | 7 tools + streaming /chat, dev debug panel, daily Gemini briefing on dashboard |

## Slice 7 — Income intelligence & onboarding

**Why first:** Everything proactive needs a baseline. Without an income figure (estimated until detected, then real) the budget recommender, savings tracker, and cashflow forecaster all fall back to crude heuristics.

**Onboarding wizard** (new flow at `/onboarding`, redirected to from auth callback if user has no `user_settings`):
1. Estimate average monthly income (number input, AUD).
2. Optional: pick a savings target (default 15% of income).
3. Suggested budget breakdown shown on screen, derived from income − savings target. User adjusts inline; "Apply all" persists to `budgets` table.
4. "Connect bank" call-to-action lands them on the existing Basiq flow.

**Income auto-detection** (extends the Slice 5 detector):
- Schema: add `direction` enum (`'expense' | 'income'`, default `'expense'`) to `recurring_expenses`. Existing rows are expense.
- Run the detector twice each scan: once on outflows (current behaviour), once on positive-amount `category=income` transactions.
- Same density / cadence-tightness / amount-stability gates apply. Paychecks should flag cleanly (fortnightly, exact amount, exact day-of-week).
- Anything tagged `category=income` that isn't part of a series is "additional income" (gifts, refunds, ad-hoc).

**Real-vs-estimated income reconciliation:**
- `user_settings.estimated_monthly_income_cents` (the user's onboarding answer, kept as a baseline).
- A computed "actual monthly income" derived from detected recurring income (sum × cadence-to-month factor) + last-30-days additional income.
- Agent and briefing surface drift: "your detected income is $4800/mo, you estimated $4500. Want to refresh budgets?"

**Suggested budget engine:**
- Income-derived split, recomputed live on income or savings-target change.
- Default split (Sydney/AU-tuned, after savings target carved out): rent 30%, groceries 15%, utilities 6%, transport 8%, dining 10%, entertainment 5%, shopping 8%, health 4%, subscriptions 3%, other 11%. Sensible ceilings (utilities ≤ $400/mo, etc).
- Surfaces on `/budgets` as a "Suggested" column next to current. One-click apply per row + apply-all. Never overwrites without explicit click.

**Savings target** (drops the v2 deferral I'd previously suggested):
- `user_settings.monthly_savings_target_cents`.
- On-track widget shows savings progress as residual: `income − non-transfer outflows − upcoming committed`.
- Briefing leads with savings status when relevant.

**Schema delta:**
- `recurring_expenses`: + `direction` enum column.
- `user_settings`: + `estimated_monthly_income_cents`, + `monthly_savings_target_cents`. The current `monthly_income_cents` becomes `estimated_monthly_income_cents` (single rename migration).

**Agent tools changed:**
- `get_overall_health` returns savings progress, estimated vs actual income, drift flag.
- New: `get_recurring_income()` — list of detected paychecks/series.

## Slice 8 — Account balances & cashflow forecast

**Why this slice:** "Will I run out of money on the 12th?" is the single most useful question a personal-finance app can answer. We can't answer it without balances.

**Pull balances from Basiq:**
- `GET /users/{id}/accounts` returns current + available balance per account. Wire that into the existing sync.
- Schema: new `accounts` table (basiq_account_id, name, type, current_balance_cents, available_balance_cents, balance_as_of). Account-level history is a v2 concern; for v1 we just keep the latest snapshot.

**Cashflow simulator:**
- Pure function (`lib/cashflow/simulate.ts`), vitest-tested. Takes current balance + detected recurring income with `next_expected_date` + detected recurring outflows + variable-spend baseline (rolling 30-day average). Walks forward day-by-day for 60 days, returns a `{date, projected_balance_cents, events: [...]}` series.
- Risk detection: any day where projected balance < buffer (default $200, configurable in user_settings) gets flagged with the trigger event.

**UI:**
- Dashboard: current balance card (per account if multiple), next risk-day callout when present.
- Trends page (Slice 10) gets the full forecast chart.

**Agent tools:**
- `get_balances()` — current + available.
- `get_cashflow_forecast(days?)` — projected daily balance + risk days.

**Briefing wiring:**
- Briefing prompt now sees forecast snippet. "Watch out — your $180 AGL bill on the 12th plus rent on the 15th puts checking at $80 by mid-month before next paycheck on the 17th."

**Schema delta:**
- New `accounts` table.
- `user_settings`: + `cashflow_buffer_cents` (default 20000).

## Slice 9 — Anomaly detection & pending alerts (was Slice 7)

**Statistical anomaly detector:**
- Per-category and per-merchant rolling baselines (median + MAD or stddev). Flag transactions ≥2σ above norm.
- Recurring price-change detector: a leg of a known series whose amount differs >15% from typical → flagged ("Spotify went from $14 to $17").

**Pending interception:**
- Existing `pending` flag is already populated. Any pending transaction that would push a category over its cap if it posts → in-app card with the option to dismiss or treat-as-confirmed.

**Income lateness:**
- A recurring income series whose `next_expected_date` is more than 2 days in the past with no matching new leg → flagged ("paycheck expected on the 15th hasn't landed").

**Surface:** dismissible cards on `/dashboard`, plus `get_alerts()` agent tool. Cards are persisted in a new `alerts` table so dismissals stick across reloads.

**Schema delta:**
- New `alerts` table (id, user_id, kind, severity, title, body, source_id [optional fk], status [open/dismissed], created_at).

## Slice 10 — Trends + polish (was Slice 8)

- Recharts trends page: per-category line/bar over the last 6-12 months. Hover for monthly totals.
- Cashflow forecast chart on `/trends` (full 60-day projection from Slice 8).
- Mobile responsive pass: dashboard, transactions, /budgets, /chat all need attention.
- Settings polish: bank reconnect button, basic account management, notification preferences (in-app only for v1).

No schema deltas. Pure UI/UX.

## Slice 11 — Adaptive recommendations

The system stops *answering* questions and starts *raising them* unprompted. Daily cron generates a fresh recommendation set based on the data accumulated:

- **Income shift detected** — 3+ consecutive paychecks ≥10% different from the baseline. "Your income has averaged $4800/mo over the last quarter, up from $4500. Want to refresh your budgets?"
- **Consistent under-spend** — under 50% of a category's cap for 3+ months. "You've barely touched dining at $200/mo cap, averaging $80. Want to drop the cap and add the $120 to savings?"
- **Recurring price increase** — caught by Slice 9's price-change detector, but here we suggest a budget bump.
- **Cashflow consistently tight** — flagged by Slice 8 forecast 3 months running. "You're cutting it close every month. Either trim a category by $200 or relax the savings target."
- **Goal pace off** — savings target at risk based on detected actuals.

**UX:** dashboard "Smart suggestions" section. Each card is accept (applies the change via existing budget/setting actions), dismiss, or "remind me later". `get_recommendations()` agent tool surfaces the same data.

**Schema delta:**
- New `recommendations` table (id, user_id, kind, payload jsonb, status [open/accepted/dismissed/snoozed], created_at, snooze_until).

## Slice 12 — Goals & long-horizon projections

- Schema: `savings_goals` (id, user_id, name, target_cents, target_date, current_cents, kind [emergency/purchase/general]).
- Goal progress UI on dashboard.
- Agent tools:
  - `get_goals()` — list with progress + projected hit-date at current pace.
  - `can_i_afford_purchase(amount, by_date)` — multi-month outlook for one-time large spends. "Can I afford a $5000 trip in 3 months?" runs a forward simulation including all known recurring + budget assumptions.
- Briefing leads with goal status when something material is happening: "you'll hit your $10k emergency fund 6 weeks ahead of target if this pace holds."

This is the slice where the platform finally feels like an *advisor* rather than a *dashboard*.

## Cross-cutting capabilities (built up over slices)

- **The daily briefing** gets smarter each slice as more data is available. By Slice 12, it's leading with the most consequential thing across budgets, cashflow, anomalies, recommendations, and goals.
- **The agent's tool surface** keeps expanding — by the end it's the primary "ask anything" interface for the user's full financial picture.
- **Budget alerts evolve** from simple threshold (Slice 2) → cap with projection (Slice 2) → projection with committed-recurring (Slice 5) → predictive with cashflow risk (Slice 8) → recommended adjustments (Slice 11).

## Sequencing rationale

- 7 and 8 are **data layer** slices — income and balances. Without them the system can't be predictive.
- 9 and 10 are **surface** slices — anomaly cards and visualisation make the data legible.
- 11 closes the loop: data → recommendations → user actions → updated data.
- 12 extends the time horizon from "this month" to "this year and beyond".

Each slice is roughly 1-2 days of focused work. Total to feature-complete v1: ~10-14 days from now.

## Out of scope for v1

Still deferred — these stay out unless explicitly promoted:
- Mobile app (responsive web only — Slice 10 covers mobile responsive)
- Multi-currency beyond AUD
- Shared / family accounts
- CSV upload, receipt photos
- Email / SMS / push notifications (in-app only)
- Multi-bank-account intelligence beyond per-account balances
- Tax categorisation (deductible vs non-deductible)
