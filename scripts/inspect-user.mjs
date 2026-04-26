// Sanity-check dump for one user's metriX state. Connects via DATABASE_URL,
// looks the user up by email, and prints every aggregate the dashboard /
// agent tools compute. One-off — not committed to long-running tooling.
//
// Usage: pnpm exec dotenv -e .env.local -- node scripts/inspect-user.mjs [email]
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const email = process.argv[2] ?? "bmarschner21@gmail.com";
const sql = postgres(url, { prepare: false, max: 1 });

const fmt = (cents) => {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
};

const todayISO = (() => {
  const d = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Sydney",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  return d.toISOString().slice(0, 10);
})();

const monthStart = todayISO.slice(0, 8) + "01";
const monthEndISO = (() => {
  const y = Number(todayISO.slice(0, 4));
  const m = Number(todayISO.slice(5, 7));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${todayISO.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
})();
const dayOfMonth = Number(todayISO.slice(8, 10));
const daysInMonth = Number(monthEndISO.slice(8, 10));

try {
  console.log(`Today (Sydney): ${todayISO}  · day ${dayOfMonth} of ${daysInMonth}`);
  console.log(`Window:        ${monthStart} → ${todayISO}  (month ends ${monthEndISO})`);

  // -------- user --------
  const users = await sql`SELECT id, email FROM auth.users WHERE email = ${email}`;
  if (users.length === 0) {
    console.error(`\nNo user with email ${email}`);
    process.exit(1);
  }
  const userId = users[0].id;
  console.log(`\nUser: ${email}  (${userId})`);

  // -------- settings --------
  const [settings] = await sql`
    SELECT monthly_income_cents, monthly_savings_target_cents, cashflow_buffer_cents
    FROM user_settings WHERE user_id = ${userId}
  `;
  console.log(`\n--- SETTINGS ---`);
  if (!settings) {
    console.log("  (none)");
  } else {
    console.log(`  income          ${fmt(settings.monthly_income_cents ?? 0)}`);
    console.log(`  savings target  ${fmt(settings.monthly_savings_target_cents ?? 0)}`);
    console.log(`  buffer          ${fmt(settings.cashflow_buffer_cents ?? 0)}`);
  }

  // -------- accounts --------
  const accounts = await sql`
    SELECT account_name, account_class, account_type, status,
           current_balance_cents, available_balance_cents
    FROM accounts WHERE user_id = ${userId} ORDER BY account_class, account_name
  `;
  console.log(`\n--- ACCOUNTS (${accounts.length}) ---`);
  let spendable = 0;
  for (const a of accounts) {
    const cur = a.current_balance_cents ?? 0;
    const avail = a.available_balance_cents ?? 0;
    const counted =
      a.account_class === "transaction" &&
      (a.status === "active" || a.status === "available");
    if (counted) spendable += avail || cur;
    const tag = counted ? "[SPENDABLE]" : "[other ]";
    console.log(
      `  ${tag} class=${(a.account_class ?? "?").padEnd(12)} ${(a.account_name ?? "?").padEnd(28)} type=${(a.account_type ?? "?").padEnd(10)} current=${fmt(cur).padStart(10)} avail=${fmt(avail).padStart(10)} status=${a.status}`,
    );
  }
  console.log(`\n  Spendable (transaction-class only): ${fmt(spendable)}`);

  // -------- budgets --------
  const budgets = await sql`
    SELECT category, monthly_cap_cents
    FROM budgets WHERE user_id = ${userId} ORDER BY category
  `;
  console.log(`\n--- BUDGETS ---`);
  for (const b of budgets) {
    console.log(`  ${b.category.padEnd(14)} ${fmt(b.monthly_cap_cents)}`);
  }

  // Account ids to exclude from spend math (mortgage / savings / loan / investment).
  const nonSpendable = await sql`
    SELECT basiq_account_id FROM accounts
    WHERE user_id = ${userId} AND account_class = ANY(${["mortgage", "loan", "savings", "investment"]})
  `;
  const excludedIds = nonSpendable.map((r) => r.basiq_account_id);

  // -------- this month: spend per category (FIXED: excludes non-spendable accounts) --------
  const monthSpend = await sql`
    SELECT category, SUM(ABS(amount_cents))::int AS cents, COUNT(*)::int AS n
    FROM transactions
    WHERE user_id = ${userId}
      AND transaction_date >= ${monthStart}
      AND transaction_date <= ${todayISO}
      AND amount_cents < 0
      AND is_transfer = false
      AND (category IS NULL OR category NOT IN ('income', 'transfer'))
      AND (account_id IS NULL OR account_id != ALL(${excludedIds}))
    GROUP BY category
    ORDER BY cents DESC NULLS LAST
  `;

  // Per-category recurring spend this month (linked to a series).
  const recurringSpend = await sql`
    SELECT category, SUM(ABS(amount_cents))::int AS cents
    FROM transactions
    WHERE user_id = ${userId}
      AND transaction_date >= ${monthStart}
      AND transaction_date <= ${todayISO}
      AND amount_cents < 0
      AND is_transfer = false
      AND recurring_expense_id IS NOT NULL
      AND (account_id IS NULL OR account_id != ALL(${excludedIds}))
    GROUP BY category
  `;
  const recurringSpendByCat = Object.fromEntries(recurringSpend.map((r) => [r.category, r.cents]));

  // Upcoming committed per category for the rest of the month.
  const upcomingByCatRaw = await sql`
    SELECT category, SUM(typical_amount_cents)::int AS cents
    FROM recurring_expenses
    WHERE user_id = ${userId}
      AND direction = 'expense'
      AND status = 'active'
      AND ignored = false
      AND next_expected_date > ${todayISO}
      AND next_expected_date <= ${monthEndISO}
    GROUP BY category
  `;
  const upcomingByCat = Object.fromEntries(upcomingByCatRaw.map((r) => [r.category, r.cents]));

  console.log(`\n--- THIS MONTH SPEND (${monthStart} → ${todayISO})  [excl. mortgage / savings] ---`);
  let totalSpent = 0;
  for (const r of monthSpend) {
    const cap = budgets.find((b) => b.category === r.category)?.monthly_cap_cents;
    const linearProj = dayOfMonth > 0 ? Math.round((r.cents * daysInMonth) / dayOfMonth) : r.cents;
    const recurringSpentInCat = recurringSpendByCat[r.category] ?? 0;
    const upcomingInCat = upcomingByCat[r.category] ?? 0;
    const variableSoFar = Math.max(0, r.cents - recurringSpentInCat);
    const daysRemaining = daysInMonth - dayOfMonth;
    const variablePerDay = dayOfMonth > 0 ? variableSoFar / dayOfMonth : 0;
    const variableRemaining = Math.round(variablePerDay * daysRemaining);
    const smartProj = r.cents + upcomingInCat + variableRemaining;

    const pct = cap ? `${Math.round((r.cents / cap) * 100)}% of ${fmt(cap)}` : "no budget";
    const projInfo = cap
      ? `linear ${fmt(linearProj)} | smart ${fmt(smartProj)} (= ${Math.round((smartProj / cap) * 100)}%)`
      : `linear ${fmt(linearProj)} | smart ${fmt(smartProj)}`;
    console.log(
      `  ${(r.category ?? "(uncat)").padEnd(14)} ${fmt(r.cents).padStart(10)}  (${r.n} txns)  ${pct.padEnd(22)} ${projInfo}`,
    );
    if (r.category) totalSpent += r.cents;
  }
  console.log(`  total spent (excl income/transfer/uncat, excl non-spendable accounts): ${fmt(totalSpent)}`);

  // -------- upcoming committed (recurring expenses) --------
  const upcomingFull = await sql`
    SELECT category,
           SUM(typical_amount_cents)::int AS cents,
           COUNT(*)::int AS n,
           array_agg(merchant_name || ' on ' || next_expected_date::text) AS items
    FROM recurring_expenses
    WHERE user_id = ${userId}
      AND direction = 'expense'
      AND status = 'active'
      AND ignored = false
      AND next_expected_date > ${todayISO}
      AND next_expected_date <= ${monthEndISO}
    GROUP BY category
  `;
  console.log(`\n--- UPCOMING COMMITTED (${todayISO} → ${monthEndISO}) ---`);
  let totalUpcoming = 0;
  for (const r of upcomingFull) {
    console.log(`  ${r.category.padEnd(14)} ${fmt(r.cents).padStart(10)} (${r.n}): ${r.items.join(", ")}`);
    totalUpcoming += r.cents;
  }
  if (upcomingFull.length === 0) console.log(`  (none scheduled)`);
  console.log(`  total upcoming: ${fmt(totalUpcoming)}`);

  // -------- recurring expenses (full list) --------
  const recurring = await sql`
    SELECT merchant_name, category, cadence, direction, typical_amount_cents,
           status, ignored, next_expected_date, last_seen_date, leg_count, source
    FROM recurring_expenses
    WHERE user_id = ${userId}
    ORDER BY direction, status, next_expected_date
  `;
  console.log(`\n--- RECURRING (${recurring.length}) ---`);
  for (const r of recurring) {
    const flag = r.ignored ? " [IGN]" : r.status === "inactive" ? " [INA]" : "";
    console.log(
      `  [${r.direction}] ${(r.merchant_name ?? "?").padEnd(22)} ${r.cadence.padEnd(11)} ${fmt(r.typical_amount_cents).padStart(10)} cat=${r.category.padEnd(14)} next=${r.next_expected_date}  legs=${r.leg_count}${flag}`,
    );
  }

  // -------- subscriptions deep-dive --------
  console.log(`\n--- SUBSCRIPTIONS DEEP-DIVE ---`);
  const subTxns = await sql`
    SELECT transaction_date, merchant_name, description, amount_cents, recurring_expense_id
    FROM transactions
    WHERE user_id = ${userId}
      AND category = 'subscriptions'
      AND transaction_date >= ${monthStart}
      AND transaction_date <= ${todayISO}
      AND amount_cents < 0
    ORDER BY transaction_date
  `;
  let subsSpent = 0;
  for (const t of subTxns) {
    subsSpent += Math.abs(t.amount_cents);
    console.log(
      `  ${t.transaction_date}  ${(t.merchant_name ?? t.description).padEnd(28)} ${fmt(Math.abs(t.amount_cents)).padStart(10)}  ${t.recurring_expense_id ? "(linked)" : "(unlinked)"}`,
    );
  }
  const subBudget = budgets.find((b) => b.category === "subscriptions")?.monthly_cap_cents ?? 0;
  const subsProjected =
    dayOfMonth > 0 ? Math.round((subsSpent * daysInMonth) / dayOfMonth) : subsSpent;
  const subsUpcoming = await sql`
    SELECT merchant_name, typical_amount_cents, next_expected_date
    FROM recurring_expenses
    WHERE user_id = ${userId}
      AND direction = 'expense'
      AND category = 'subscriptions'
      AND status = 'active'
      AND ignored = false
      AND next_expected_date > ${todayISO}
      AND next_expected_date <= ${monthEndISO}
    ORDER BY next_expected_date
  `;
  let subsCommitted = 0;
  for (const r of subsUpcoming) subsCommitted += r.typical_amount_cents;
  console.log(`\n  Spent so far this month:    ${fmt(subsSpent)}`);
  console.log(`  Budget cap:                 ${fmt(subBudget)}`);
  console.log(`  Linear projection (used):   ${fmt(subsProjected)}  ← spent × ${daysInMonth}/${dayOfMonth}`);
  console.log(`  Upcoming this month:        ${fmt(subsCommitted)}  (${subsUpcoming.length} charges)`);
  for (const r of subsUpcoming) {
    console.log(`    ${r.next_expected_date}  ${r.merchant_name}  ${fmt(r.typical_amount_cents)}`);
  }
  console.log(`  Recurring-aware projection: ${fmt(subsSpent + subsCommitted)}`);
} finally {
  await sql.end();
}
