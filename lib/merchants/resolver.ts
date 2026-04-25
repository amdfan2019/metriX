import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category } from "@/lib/db/schema";
import { categorizeBatch, type CategorizeResult } from "@/lib/gemini/categorize";

/** Threshold above which we treat a Gemini result as confident enough to set the category without review. */
const CONFIDENCE_THRESHOLD = 0.8;

/** Trigram similarity threshold for fuzzy alias match. */
const FUZZY_SIM_THRESHOLD = 0.6;

/** Max transactions per Gemini call. */
const GEMINI_BATCH_SIZE = 20;

export interface ResolveSummary {
  totalUnresolved: number;
  resolvedByAlias: number;
  resolvedByFuzzy: number;
  resolvedByGemini: number;
  flaggedForReview: number;
  geminiCalls: number;
}

interface UnresolvedTxn {
  id: string;
  description: string;
  amountCents: number;
}

interface MatchOutcome {
  txnId: string;
  rawDescription: string;
  merchantName: string;
  category: Category;
  confidence: number;
  source: "alias" | "fuzzy" | "gemini";
  needsReview: boolean;
}

/**
 * Walks every uncategorised transaction belonging to `userId`:
 *   1. Exact-match on merchant_aliases.raw_description → use it (deterministic).
 *   2. Trigram fuzzy match against existing aliases (similarity > 0.6) → use it.
 *   3. Remaining: batch in groups of 20 → Gemini.
 *      - confidence ≥ 0.8: set category, persist alias with source=gemini.
 *      - else: flag needs_review for the user.
 */
export async function resolveUserTransactions(
  supabase: SupabaseClient,
  userId: string,
): Promise<ResolveSummary> {
  const summary: ResolveSummary = {
    totalUnresolved: 0,
    resolvedByAlias: 0,
    resolvedByFuzzy: 0,
    resolvedByGemini: 0,
    flaggedForReview: 0,
    geminiCalls: 0,
  };

  // 1. Pull unresolved txns. "Unresolved" = no category AND not currently in review queue.
  const { data: unresolvedRows, error: fetchErr } = await supabase
    .from("transactions")
    .select("id, description, amount_cents")
    .eq("user_id", userId)
    .is("category", null)
    .eq("needs_review", false);
  if (fetchErr) throw new Error(`resolver: fetch unresolved failed: ${fetchErr.message}`);
  const unresolved: UnresolvedTxn[] = (unresolvedRows ?? []).map((r) => ({
    id: r.id as string,
    description: r.description as string,
    amountCents: r.amount_cents as number,
  }));
  summary.totalUnresolved = unresolved.length;
  if (unresolved.length === 0) return summary;

  // 2. Group by raw_description so each unique string is resolved once.
  const byRaw = new Map<string, UnresolvedTxn[]>();
  for (const t of unresolved) {
    const list = byRaw.get(t.description) ?? [];
    list.push(t);
    byRaw.set(t.description, list);
  }

  // 3. Try exact alias match in bulk. Chunked because PostgREST encodes the
  // .in() filter into the URL query string and we'd otherwise blow past the
  // ~8KB URL limit at a few hundred unique descriptions.
  const uniqueRaws = [...byRaw.keys()];
  const ALIAS_LOOKUP_CHUNK = 50;
  const exactByRaw = new Map<string, { merchantName: string; category: Category; confidence: number }>();

  for (let i = 0; i < uniqueRaws.length; i += ALIAS_LOOKUP_CHUNK) {
    const chunk = uniqueRaws.slice(i, i + ALIAS_LOOKUP_CHUNK);
    const { data: aliasRows, error: aliasErr } = await supabase
      .from("merchant_aliases")
      .select("raw_description, merchant_name, category, source, confidence")
      .eq("user_id", userId)
      .in("raw_description", chunk);
    if (aliasErr) throw new Error(`resolver: alias lookup failed: ${aliasErr.message}`);
    for (const a of aliasRows ?? []) {
      exactByRaw.set(a.raw_description as string, {
        merchantName: a.merchant_name as string,
        category: a.category as Category,
        confidence: a.confidence ? Number(a.confidence) : 1.0,
      });
    }
  }

  const outcomes: MatchOutcome[] = [];
  const stillUnresolvedRaws: string[] = [];

  for (const raw of uniqueRaws) {
    const txns = byRaw.get(raw)!;
    const hit = exactByRaw.get(raw);
    if (hit) {
      for (const t of txns) {
        outcomes.push({
          txnId: t.id,
          rawDescription: raw,
          merchantName: hit.merchantName,
          category: hit.category,
          confidence: hit.confidence,
          source: "alias",
          needsReview: false,
        });
      }
      summary.resolvedByAlias += txns.length;
    } else {
      stillUnresolvedRaws.push(raw);
    }
  }

  // 4. Trigram fuzzy match for the rest, one query per unique raw description.
  // For volume we batch via a SQL function would be tighter — for v1 keep it simple.
  const fuzzyResolved = new Set<string>();
  for (const raw of stillUnresolvedRaws) {
    const fuzzy = await fuzzyAliasMatch(supabase, userId, raw);
    if (!fuzzy) continue;
    const txns = byRaw.get(raw)!;
    for (const t of txns) {
      outcomes.push({
        txnId: t.id,
        rawDescription: raw,
        merchantName: fuzzy.merchantName,
        category: fuzzy.category,
        confidence: fuzzy.similarity, // trigram similarity in [0,1]
        source: "fuzzy",
        needsReview: false,
      });
    }
    summary.resolvedByFuzzy += txns.length;
    fuzzyResolved.add(raw);
  }

  const geminiTargets = stillUnresolvedRaws.filter((r) => !fuzzyResolved.has(r));

  // 5. Batched Gemini calls for the remainder.
  for (let i = 0; i < geminiTargets.length; i += GEMINI_BATCH_SIZE) {
    const slice = geminiTargets.slice(i, i + GEMINI_BATCH_SIZE);
    const requests = slice.map((raw) => {
      const sample = byRaw.get(raw)![0];
      return { rawDescription: raw, amountCents: sample.amountCents };
    });

    let results: CategorizeResult[];
    try {
      console.log(`[resolver] Gemini batch ${i / GEMINI_BATCH_SIZE + 1}: ${slice.length} txns`);
      results = await categorizeBatch(requests);
      summary.geminiCalls++;
      console.log(`[resolver] batch returned ${results.length} results`);
    } catch (e) {
      console.error("[resolver] Gemini batch FAILED:", e);
      if (e instanceof Error && "cause" in e) {
        console.error("[resolver] cause:", (e as Error & { cause?: unknown }).cause);
      }
      // Re-throw so the action surfaces the error to the user instead of
      // silently dropping. Batches all-or-nothing for v1; we can refine later.
      throw e;
    }

    const resultByRaw = new Map(results.map((r) => [r.rawDescription, r]));
    for (const raw of slice) {
      const r = resultByRaw.get(raw);
      const txns = byRaw.get(raw)!;
      if (!r) {
        // Gemini didn't return a result for this row — flag for review.
        for (const t of txns) {
          outcomes.push({
            txnId: t.id,
            rawDescription: raw,
            merchantName: raw,
            category: "other",
            confidence: 0,
            source: "gemini",
            needsReview: true,
          });
        }
        summary.flaggedForReview += txns.length;
        continue;
      }
      const review = r.confidence < CONFIDENCE_THRESHOLD;
      for (const t of txns) {
        outcomes.push({
          txnId: t.id,
          rawDescription: raw,
          merchantName: r.merchantName,
          category: r.category,
          confidence: r.confidence,
          source: "gemini",
          needsReview: review,
        });
      }
      if (review) summary.flaggedForReview += txns.length;
      else summary.resolvedByGemini += txns.length;
    }
  }

  // 6. Apply outcomes to DB. Two updates: transactions, and aliases (only for confident gemini results).
  await applyOutcomes(supabase, userId, outcomes);

  return summary;
}

interface FuzzyHit {
  merchantName: string;
  category: Category;
  similarity: number;
}

async function fuzzyAliasMatch(
  supabase: SupabaseClient,
  userId: string,
  raw: string,
): Promise<FuzzyHit | null> {
  // We use Postgres's similarity() from pg_trgm. PostgREST can't express this
  // in a select query, so we go through an RPC. The function is defined in
  // the seed SQL alongside the pg_trgm extension.
  const { data, error } = await supabase.rpc("fuzzy_alias_match", {
    p_user_id: userId,
    p_raw: raw,
    p_threshold: FUZZY_SIM_THRESHOLD,
  });
  if (error) {
    console.error("fuzzy_alias_match RPC failed", error);
    return null;
  }
  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    merchantName: row.merchant_name,
    category: row.category as Category,
    similarity: Number(row.similarity),
  };
}

async function applyOutcomes(
  supabase: SupabaseClient,
  userId: string,
  outcomes: MatchOutcome[],
): Promise<void> {
  if (outcomes.length === 0) return;

  // Update transactions.
  for (const o of outcomes) {
    const { error } = await supabase
      .from("transactions")
      .update({
        merchant_name: o.merchantName,
        category: o.category,
        confidence: o.confidence,
        needs_review: o.needsReview,
      })
      .eq("id", o.txnId);
    if (error) throw new Error(`resolver: txn update failed (${o.txnId}): ${error.message}`);
  }

  // Persist new aliases for confident gemini outcomes (alias matches obviously
  // already exist; fuzzy matches were derived from existing aliases too).
  const newAliases = outcomes
    .filter((o) => o.source === "gemini" && !o.needsReview)
    // Dedup by raw_description
    .reduce<Map<string, MatchOutcome>>((acc, o) => {
      acc.set(o.rawDescription, o);
      return acc;
    }, new Map());

  if (newAliases.size === 0) return;

  const aliasRows = [...newAliases.values()].map((o) => ({
    user_id: userId,
    raw_description: o.rawDescription,
    merchant_name: o.merchantName,
    category: o.category,
    source: "gemini" as const,
    confidence: o.confidence,
  }));

  const { error } = await supabase
    .from("merchant_aliases")
    .upsert(aliasRows, { onConflict: "user_id,raw_description" });
  if (error) throw new Error(`resolver: alias upsert failed: ${error.message}`);
}
