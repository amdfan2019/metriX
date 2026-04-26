import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cadence, Category } from "@/lib/db/schema";
import { CADENCE_WINDOWS, addDays, daysBetween } from "./cadence";
import {
  detectRecurringSeries,
  type DetectedSeries,
  type DetectInput,
  type Direction,
} from "./detect";

export interface ScanSummary {
  scanned: number;
  detected: number;
  inserted: number;
  updated: number;
  markedInactive: number;
  manualLinked: number;
}

/**
 * Pulls the user's last 365 days of transactions, runs the detector, and writes
 * results to `recurring_expenses` + `transactions.recurring_expense_id`.
 *
 * Order of operations matters:
 *  1. Manual subscriptions claim matching transactions first (substring +
 *     amount tolerance). This ensures a manually-entered "Netflix" picks up
 *     "NETFLIX.COM" charges before the detector sees them.
 *  2. The detector runs on what's left, so it never creates a duplicate
 *     detected series for transactions a manual sub already owns.
 *  3. Stale-check flips active detected rows that didn't get refreshed.
 *
 * Idempotency rules:
 *  - Detected series upsert by (user_id, merchant_name, cadence). Re-scans
 *    refresh amounts/dates without churning ids.
 *  - Manual entries (source = manual) are NEVER overwritten by the detector.
 *  - Ignored entries (ignored = true) are not re-detected.
 */
export async function rescanRecurringForUser(
  supabase: SupabaseClient,
  userId: string,
  todayISO: string,
): Promise<ScanSummary> {
  const summary: ScanSummary = {
    scanned: 0,
    detected: 0,
    inserted: 0,
    updated: 0,
    markedInactive: 0,
    manualLinked: 0,
  };

  // 1. Load existing recurring rows.
  const { data: existingRows, error: exErr } = await supabase
    .from("recurring_expenses")
    .select("id, merchant_name, cadence, direction, source, ignored, status, next_expected_date")
    .eq("user_id", userId);
  if (exErr) throw new Error(`recurring scan: existing fetch failed: ${exErr.message}`);

  const existingByKey = new Map<string, ExistingRow>();
  const existingById = new Map<string, ExistingRow>();
  for (const r of existingRows ?? []) {
    const row: ExistingRow = {
      id: r.id as string,
      merchantName: r.merchant_name as string,
      cadence: r.cadence as Cadence,
      direction: (r.direction as Direction) ?? "expense",
      source: r.source as "detected" | "manual",
      ignored: r.ignored as boolean,
      status: r.status as "active" | "inactive",
      nextExpectedDate: r.next_expected_date as string,
    };
    existingByKey.set(seriesKey(row.merchantName, row.cadence, row.direction), row);
    existingById.set(row.id, row);
  }

  // 2. Match unlinked transactions against active, non-ignored manual subs.
  // We do this BEFORE running the detector so a user-entered "Netflix" claims
  // its NETFLIX.COM legs first; the detector then never sees them and won't
  // try to create a duplicate detected row.
  for (const sub of existingByKey.values()) {
    if (sub.source !== "manual") continue;
    if (sub.ignored) continue;
    if (sub.status !== "active") continue;
    const { linkedTxnIds } = await linkManualSubscription(supabase, userId, sub.id, todayISO);
    summary.manualLinked += linkedTxnIds.length;
  }

  // 3. Load last-365-days of transactions (now possibly updated with new
  // recurring_expense_id values from step 2).
  const since = addDays(todayISO, -365);
  const { data: txnRows, error: txnErr } = await supabase
    .from("transactions")
    .select(
      "id, merchant_name, category, amount_cents, transaction_date, is_transfer, pending, recurring_expense_id",
    )
    .eq("user_id", userId)
    .gte("transaction_date", since);
  if (txnErr) throw new Error(`recurring scan: txn fetch failed: ${txnErr.message}`);

  const candidates: DetectInput[] = (txnRows ?? []).map((r) => ({
    id: r.id as string,
    merchantName: r.merchant_name as string | null,
    category: r.category as DetectInput["category"],
    amountCents: r.amount_cents as number,
    transactionDate: r.transaction_date as string,
    isTransfer: r.is_transfer as boolean,
    pending: r.pending as boolean,
  }));
  summary.scanned = candidates.length;

  // Exclude transactions already claimed by a manual sub from the detector's
  // input — that prevents a duplicate detected series being created on top of
  // a manual one.
  const claimedByManual = new Set<string>();
  for (const r of txnRows ?? []) {
    const reId = r.recurring_expense_id as string | null;
    if (!reId) continue;
    const sub = existingById.get(reId);
    if (sub?.source === "manual") claimedByManual.add(r.id as string);
  }
  const detectorInput = candidates.filter((c) => !claimedByManual.has(c.id));

  // 4. Detect series — once for outflows (the original Slice 5 case), once
  // for inflows (Slice 7: paycheck recurring detection). Same algorithm,
  // different input filter.
  const detected = [
    ...detectRecurringSeries(detectorInput, { direction: "expense" }),
    ...detectRecurringSeries(detectorInput, { direction: "income" }),
  ];
  summary.detected = detected.length;

  // 5. Upsert detected series (preserving manual + ignored).
  const refreshedSeriesIds = new Set<string>();
  for (const s of detected) {
    const key = seriesKey(s.merchantName, s.cadence, s.direction);
    const existing = existingByKey.get(key);

    if (existing?.ignored) {
      // Honour the user's "this isn't recurring" decision. We still link any
      // new legs so the rationale stays visible.
      refreshedSeriesIds.add(existing.id);
      await linkLegs(supabase, userId, existing.id, s.legIds);
      continue;
    }

    if (existing && existing.source === "manual") {
      // A manual row at this merchant+cadence already exists. We don't
      // overwrite the user's entry — instead we link the legs to it and let
      // the manual-link refresh logic update its derived stats. This branch
      // is rarely hit (the detectorInput filter above should already have
      // excluded the legs) but kept as a safety net.
      refreshedSeriesIds.add(existing.id);
      await linkLegs(supabase, userId, existing.id, s.legIds);
      await refreshSubscriptionStats(supabase, userId, existing.id, todayISO);
      continue;
    }

    // Stale at detection? A series whose computed next_expected_date is more
    // than one cadence in the past is "we found 4 months of history but it
    // stopped" — write it as inactive on first sight rather than rely on the
    // post-pass to flip it later (the post-pass skips refreshed rows).
    const cadenceDays = CADENCE_WINDOWS[s.cadence].centerDays;
    const isStaleAtDetection =
      s.nextExpectedDate <= todayISO &&
      daysBetween(s.nextExpectedDate, todayISO) > cadenceDays;
    const detectionStatus: "active" | "inactive" = isStaleAtDetection ? "inactive" : "active";

    if (existing) {
      const updatePayload: Record<string, unknown> = {
        category: s.category,
        typical_amount_cents: s.typicalAmountCents,
        min_amount_cents: s.minAmountCents,
        max_amount_cents: s.maxAmountCents,
        first_seen_date: s.firstSeenDate,
        last_seen_date: s.lastSeenDate,
        next_expected_date: s.nextExpectedDate,
        leg_count: s.legCount,
        status: detectionStatus,
        confidence: s.confidence,
      };
      const { error: upErr } = await supabase
        .from("recurring_expenses")
        .update(updatePayload)
        .eq("id", existing.id);
      if (upErr) throw new Error(`recurring scan: update failed: ${upErr.message}`);
      summary.updated++;
      if (detectionStatus === "inactive") summary.markedInactive++;
      refreshedSeriesIds.add(existing.id);
      await linkLegs(supabase, userId, existing.id, s.legIds);
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("recurring_expenses")
        .insert({
          user_id: userId,
          merchant_name: s.merchantName,
          category: s.category,
          cadence: s.cadence,
          direction: s.direction,
          typical_amount_cents: s.typicalAmountCents,
          min_amount_cents: s.minAmountCents,
          max_amount_cents: s.maxAmountCents,
          first_seen_date: s.firstSeenDate,
          last_seen_date: s.lastSeenDate,
          next_expected_date: s.nextExpectedDate,
          leg_count: s.legCount,
          status: detectionStatus,
          source: "detected",
          confidence: s.confidence,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(`recurring scan: insert failed: ${insErr.message}`);
      if (detectionStatus === "inactive") summary.markedInactive++;
      summary.inserted++;
      const newId = inserted!.id as string;
      refreshedSeriesIds.add(newId);
      await linkLegs(supabase, userId, newId, s.legIds);
    }
  }

  // 6. Cleanup pass — flip detected rows to inactive when either:
  //   (a) Cadence collision: a different-cadence series for the same
  //       (merchant, direction) was refreshed this scan, so this row is the
  //       obsolete one. Without this, a paycheck redetected as 'fortnightly'
  //       would coexist with an old 'monthly' detection of the same merchant
  //       and the agent would double-count income.
  //   (b) Stale: this row wasn't refreshed AND its next_expected_date is
  //       more than one cadence in the past — looks cancelled.
  // Manual rows are never auto-flipped; the user owns them.
  const refreshedMerchantDirection = new Set<string>();
  for (const id of refreshedSeriesIds) {
    const row = existingById.get(id);
    if (row) refreshedMerchantDirection.add(`${row.merchantName}::${row.direction}`);
  }

  for (const existing of existingByKey.values()) {
    if (existing.source === "manual") continue;
    if (refreshedSeriesIds.has(existing.id)) continue;
    if (existing.status !== "active") continue;

    const md = `${existing.merchantName}::${existing.direction}`;
    const isCadenceCollision = refreshedMerchantDirection.has(md);

    const cadenceDays = CADENCE_WINDOWS[existing.cadence].centerDays;
    const isStale =
      existing.nextExpectedDate <= todayISO &&
      daysBetween(existing.nextExpectedDate, todayISO) > cadenceDays;

    if (!isCadenceCollision && !isStale) continue;

    const { error: stErr } = await supabase
      .from("recurring_expenses")
      .update({ status: "inactive" })
      .eq("id", existing.id);
    if (stErr) throw new Error(`recurring scan: stale flip failed: ${stErr.message}`);
    summary.markedInactive++;
  }

  return summary;
}

/**
 * Match unlinked transactions to a manual subscription and link them.
 *
 * Heuristics:
 *  - Substring match (case-insensitive) on either `merchant_name` or
 *    `description`. The user types "Netflix"; we want "NETFLIX.COM",
 *    "Netflix Streaming", etc. to all match.
 *  - Amount within tolerance — ±25% for tight subs (Netflix, Spotify),
 *    ±50% for utilities/rent (which legitimately swing season-to-season).
 *  - Skip transfers, pending, and anything already linked to a recurring
 *    series (we don't steal legs from another sub).
 *  - Skip merchant names shorter than 3 characters — too broad.
 *
 * Returns the ids of newly-linked transactions. Also refreshes the sub's
 * first_seen/last_seen/leg_count/typical/min/max/next_expected_date.
 */
export async function linkManualSubscription(
  supabase: SupabaseClient,
  userId: string,
  subId: string,
  todayISO: string,
): Promise<{ linkedTxnIds: string[] }> {
  const { data: sub, error: subErr } = await supabase
    .from("recurring_expenses")
    .select(
      "id, merchant_name, cadence, category, typical_amount_cents, source, ignored",
    )
    .eq("id", subId)
    .eq("user_id", userId)
    .single();
  if (subErr) throw new Error(`linkManual: load sub failed: ${subErr.message}`);
  if (sub.source !== "manual") return { linkedTxnIds: [] };
  if (sub.ignored) return { linkedTxnIds: [] };

  const term = (sub.merchant_name as string).toLowerCase().trim();
  // Strip characters that have meaning to PostgREST's filter parser or
  // SQL ILIKE; safer to drop them than try to escape.
  const sanitised = term.replace(/[%_,()*+]/g, "").trim();
  if (sanitised.length < 3) return { linkedTxnIds: [] };

  const category = sub.category as Category;
  const tolerance =
    category === "utilities" || category === "housing" ? 0.5 : 0.25;
  const typical = sub.typical_amount_cents as number;
  // typical is a positive magnitude; outflows are stored negative.
  const minMagnitude = Math.round(typical * (1 - tolerance));
  const maxMagnitude = Math.round(typical * (1 + tolerance));

  const { data: matches, error: matchErr } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("is_transfer", false)
    .eq("pending", false)
    .is("recurring_expense_id", null)
    .gte("amount_cents", -maxMagnitude)
    .lte("amount_cents", -minMagnitude)
    .or(
      `description.ilike.%${sanitised}%,merchant_name.ilike.%${sanitised}%`,
    );
  if (matchErr) throw new Error(`linkManual: match query failed: ${matchErr.message}`);

  const ids = (matches ?? []).map((m) => m.id as string);
  if (ids.length === 0) {
    // Even with no new matches, refresh stats (e.g. after a sub edit) — cheap
    // and keeps next_expected_date current.
    await refreshSubscriptionStats(supabase, userId, subId, todayISO);
    return { linkedTxnIds: [] };
  }

  await linkLegs(supabase, userId, subId, ids);
  await refreshSubscriptionStats(supabase, userId, subId, todayISO);
  return { linkedTxnIds: ids };
}

/**
 * Recompute first_seen/last_seen/leg_count/typical/min/max/next_expected for a
 * subscription based on every transaction currently linked to it. Used by
 * `linkManualSubscription` after each link pass — keeps the row honest as
 * legs trickle in over time.
 */
async function refreshSubscriptionStats(
  supabase: SupabaseClient,
  userId: string,
  subId: string,
  todayISO: string,
): Promise<void> {
  const { data: legs, error } = await supabase
    .from("transactions")
    .select("transaction_date, amount_cents")
    .eq("user_id", userId)
    .eq("recurring_expense_id", subId);
  if (error) throw new Error(`refreshStats: load legs failed: ${error.message}`);
  if (!legs || legs.length === 0) return;

  const dates = legs.map((l) => l.transaction_date as string).sort();
  const amounts = legs
    .map((l) => Math.abs(l.amount_cents as number))
    .sort((a, b) => a - b);

  const firstSeen = dates[0];
  const lastSeen = dates[dates.length - 1];
  const median = amounts[Math.floor(amounts.length / 2)];
  const min = amounts[0];
  const max = amounts[amounts.length - 1];

  const { data: subRow, error: subErr } = await supabase
    .from("recurring_expenses")
    .select("cadence")
    .eq("id", subId)
    .single();
  if (subErr) throw new Error(`refreshStats: load sub failed: ${subErr.message}`);
  const cadence = subRow.cadence as Cadence;

  // Predict next from the most recent leg. If that's already in the past, use
  // today's date as the anchor instead — the user added/kept this sub
  // expecting another charge, and we'd rather over-predict than mark it stale.
  const fromLastLeg = addDays(lastSeen, CADENCE_WINDOWS[cadence].centerDays);
  const nextExpected =
    fromLastLeg > todayISO ? fromLastLeg : addDays(todayISO, CADENCE_WINDOWS[cadence].centerDays);

  const { error: updErr } = await supabase
    .from("recurring_expenses")
    .update({
      first_seen_date: firstSeen,
      last_seen_date: lastSeen,
      leg_count: legs.length,
      typical_amount_cents: median,
      min_amount_cents: min,
      max_amount_cents: max,
      next_expected_date: nextExpected,
    })
    .eq("id", subId);
  if (updErr) throw new Error(`refreshStats: update failed: ${updErr.message}`);
}

interface ExistingRow {
  id: string;
  merchantName: string;
  cadence: Cadence;
  direction: Direction;
  source: "detected" | "manual";
  ignored: boolean;
  status: "active" | "inactive";
  nextExpectedDate: string;
}

function seriesKey(merchant: string, cadence: Cadence, direction: Direction): string {
  return `${merchant}::${cadence}::${direction}`;
}

async function linkLegs(
  supabase: SupabaseClient,
  userId: string,
  seriesId: string,
  legIds: string[],
): Promise<void> {
  if (legIds.length === 0) return;
  // Update in chunks — PostgREST .in() encodes into the URL query string and
  // we'd otherwise blow past the URL length limit on long legIds lists.
  const CHUNK = 50;
  for (let i = 0; i < legIds.length; i += CHUNK) {
    const slice = legIds.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("transactions")
      .update({ recurring_expense_id: seriesId })
      .eq("user_id", userId)
      .in("id", slice);
    if (error) throw new Error(`recurring scan: leg link failed: ${error.message}`);
  }
}

/**
 * Helper used by manual-entry actions: returns a sensible default
 * next_expected_date when the user creates a subscription with no observed history.
 */
export function defaultNextExpectedDate(cadence: Cadence, todayISO: string): string {
  return addDays(todayISO, CADENCE_WINDOWS[cadence].centerDays);
}

export type { DetectedSeries };
