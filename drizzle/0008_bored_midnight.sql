-- Drop 'subscriptions' from the category enum.
--
-- 'Subscriptions' is a billing pattern (recurring), not a substance. The user
-- wants the budget category to reflect what was bought: gym → health,
-- streaming → entertainment, cloud storage → other. Recurring billing is
-- already tracked separately via the recurring_expenses table + /subscriptions
-- page; the budget enum now contains only substance buckets.
--
-- Same dance as 0007 (rent → housing): demote columns to text, route old
-- 'subscriptions' rows to their substance category, drop the trigram RPC
-- (its TABLE return type pins the enum), drop+recreate the type, promote
-- columns back, recreate the RPC.
ALTER TABLE "budgets" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "merchant_aliases" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint

-- Route old 'subscriptions' rows by substance. Match merchants we have
-- canonical names for; everything else falls through to 'other'.
-- Order matters: most specific first.
-- Gym / fitness → health.
UPDATE "transactions" SET category = 'health' WHERE category = 'subscriptions' AND (
  merchant_name ILIKE '%goodlife%' OR merchant_name ILIKE '%anytime fitness%' OR
  merchant_name ILIKE '%fitness first%' OR merchant_name ILIKE '%f45%' OR
  merchant_name ILIKE '%gym%' OR merchant_name ILIKE '%pilates%' OR
  merchant_name ILIKE '%yoga%' OR merchant_name ILIKE '%strava%' OR
  description ILIKE '%goodlife%' OR description ILIKE '%anytime fitness%' OR
  description ILIKE '%f45%' OR description ILIKE '%gym%'
);--> statement-breakpoint
UPDATE "merchant_aliases" SET category = 'health' WHERE category = 'subscriptions' AND (
  merchant_name ILIKE '%goodlife%' OR merchant_name ILIKE '%fitness%' OR
  merchant_name ILIKE '%f45%' OR merchant_name ILIKE '%gym%' OR
  merchant_name ILIKE '%pilates%' OR merchant_name ILIKE '%yoga%' OR
  merchant_name ILIKE '%strava%'
);--> statement-breakpoint
UPDATE "recurring_expenses" SET category = 'health' WHERE category = 'subscriptions' AND (
  merchant_name ILIKE '%goodlife%' OR merchant_name ILIKE '%fitness%' OR
  merchant_name ILIKE '%f45%' OR merchant_name ILIKE '%gym%' OR
  merchant_name ILIKE '%pilates%' OR merchant_name ILIKE '%yoga%' OR
  merchant_name ILIKE '%strava%'
);--> statement-breakpoint

-- Streaming media → entertainment.
UPDATE "transactions" SET category = 'entertainment' WHERE category = 'subscriptions' AND (
  merchant_name ILIKE '%netflix%' OR merchant_name ILIKE '%spotify%' OR
  merchant_name ILIKE '%disney%' OR merchant_name ILIKE '%hulu%' OR
  merchant_name ILIKE '%stan%' OR merchant_name ILIKE '%binge%' OR
  merchant_name ILIKE '%paramount%' OR merchant_name ILIKE '%hbo%' OR
  merchant_name ILIKE '%apple music%' OR merchant_name ILIKE '%youtube premium%' OR
  description ILIKE '%netflix%' OR description ILIKE '%spotify%' OR
  description ILIKE '%disney%' OR description ILIKE '%paramount%'
);--> statement-breakpoint
UPDATE "merchant_aliases" SET category = 'entertainment' WHERE category = 'subscriptions' AND (
  merchant_name ILIKE '%netflix%' OR merchant_name ILIKE '%spotify%' OR
  merchant_name ILIKE '%disney%' OR merchant_name ILIKE '%hulu%' OR
  merchant_name ILIKE '%stan%' OR merchant_name ILIKE '%binge%' OR
  merchant_name ILIKE '%paramount%' OR merchant_name ILIKE '%hbo%' OR
  merchant_name ILIKE '%apple music%' OR merchant_name ILIKE '%youtube premium%'
);--> statement-breakpoint
UPDATE "recurring_expenses" SET category = 'entertainment' WHERE category = 'subscriptions' AND (
  merchant_name ILIKE '%netflix%' OR merchant_name ILIKE '%spotify%' OR
  merchant_name ILIKE '%disney%' OR merchant_name ILIKE '%hulu%' OR
  merchant_name ILIKE '%stan%' OR merchant_name ILIKE '%binge%' OR
  merchant_name ILIKE '%paramount%' OR merchant_name ILIKE '%hbo%' OR
  merchant_name ILIKE '%apple music%' OR merchant_name ILIKE '%youtube premium%'
);--> statement-breakpoint

-- The subscriptions budget row would collide on (user_id, category)
-- if we tried to UPDATE it to 'other' (most users already have an 'other'
-- budget). Just drop it — the user re-tunes entertainment/health/other
-- caps to absorb the lost subscriptions cap.
DELETE FROM "budgets" WHERE category = 'subscriptions';--> statement-breakpoint

-- Everything else still in 'subscriptions' (cloud storage, software tools,
-- generic Apple/Google billing) → other.
UPDATE "transactions" SET category = 'other' WHERE category = 'subscriptions';--> statement-breakpoint
UPDATE "merchant_aliases" SET category = 'other' WHERE category = 'subscriptions';--> statement-breakpoint
UPDATE "recurring_expenses" SET category = 'other' WHERE category = 'subscriptions';--> statement-breakpoint

DROP FUNCTION IF EXISTS public.fuzzy_alias_match(uuid, text, double precision);--> statement-breakpoint
DROP TYPE "public"."category";--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('groceries', 'dining', 'housing', 'utilities', 'transport', 'entertainment', 'shopping', 'health', 'income', 'transfer', 'other');--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "category" SET DATA TYPE "public"."category" USING "category"::"public"."category";--> statement-breakpoint
ALTER TABLE "merchant_aliases" ALTER COLUMN "category" SET DATA TYPE "public"."category" USING "category"::"public"."category";--> statement-breakpoint
ALTER TABLE "recurring_expenses" ALTER COLUMN "category" SET DATA TYPE "public"."category" USING "category"::"public"."category";--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "category" SET DATA TYPE "public"."category" USING "category"::"public"."category";--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.fuzzy_alias_match(p_user_id uuid, p_raw text, p_threshold double precision DEFAULT 0.6)
 RETURNS TABLE(merchant_name text, category category, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
    SELECT
      m.merchant_name,
      m.category,
      similarity(m.raw_description, p_raw) AS similarity
    FROM merchant_aliases m
    WHERE m.user_id = p_user_id
      AND similarity(m.raw_description, p_raw) > p_threshold
    ORDER BY similarity(m.raw_description, p_raw) DESC
    LIMIT 1;
  $function$
