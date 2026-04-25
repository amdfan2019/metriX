// Applies the latest drizzle-generated migration directly via postgres-js.
// We use this instead of `drizzle-kit push` because Supabase's transaction
// pooler hangs on drizzle-kit's introspection step. postgres-js connects to
// the same pooler and runs DDL fine.
//
// Usage:
//   pnpm db:apply              # applies the latest migration in drizzle/
//   pnpm db:apply <file>       # applies a specific migration
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const DRIZZLE_DIR = "drizzle";

function pickMigration() {
  const explicit = process.argv[2];
  if (explicit) return explicit;
  const files = readdirSync(DRIZZLE_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    throw new Error(`No .sql files in ${DRIZZLE_DIR}/. Run \`pnpm db:generate\` first.`);
  }
  return join(DRIZZLE_DIR, files[files.length - 1]);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const file = pickMigration();
const sql = readFileSync(file, "utf8");
const statements = sql
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`Applying ${file} (${statements.length} statements)…`);

const client = postgres(url, { prepare: false, max: 1 });

try {
  for (const [i, stmt] of statements.entries()) {
    process.stdout.write(`  [${i + 1}/${statements.length}] `);
    await client.unsafe(stmt);
    process.stdout.write("ok\n");
  }
  console.log("Done.");
} catch (err) {
  console.error(`\nFailed:`, err.message);
  process.exit(1);
} finally {
  await client.end();
}
