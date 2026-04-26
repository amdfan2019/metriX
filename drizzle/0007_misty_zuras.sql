-- Rename category 'rent' → 'housing'.
--
-- Postgres won't ALTER TYPE RENAME VALUE through Drizzle's drop-and-recreate
-- diff strategy, so we stage it manually:
--   1. demote columns to text (drops the column-level type dependency)
--   2. update old 'rent' values to 'housing' before the new enum is created;
--      also opportunistically reclassify 'Interest Charged' rows from 'other'
--      to 'housing' since mortgage interest is shelter cost
--   3. drop the trigram RPC fuzzy_alias_match — its TABLE return type holds
--      the last reference to the enum and must be dropped before DROP TYPE
--      (recreated below with the new enum)
--   4. drop + recreate the enum with the new value set
--   5. promote columns back to the enum
--   6. recreate fuzzy_alias_match
ALTER TABLE "budgets" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "merchant_aliases" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
UPDATE "budgets" SET category = 'housing' WHERE category = 'rent';--> statement-breakpoint
UPDATE "merchant_aliases" SET category = 'housing' WHERE category = 'rent';--> statement-breakpoint
UPDATE "recurring_expenses" SET category = 'housing' WHERE category = 'rent';--> statement-breakpoint
UPDATE "transactions" SET category = 'housing' WHERE category = 'rent';--> statement-breakpoint
UPDATE "merchant_aliases" SET category = 'housing' WHERE merchant_name ILIKE '%interest%charged%';--> statement-breakpoint
UPDATE "recurring_expenses" SET category = 'housing' WHERE merchant_name ILIKE '%interest%charged%';--> statement-breakpoint
UPDATE "transactions" SET category = 'housing' WHERE merchant_name ILIKE '%interest%charged%';--> statement-breakpoint
DROP FUNCTION IF EXISTS public.fuzzy_alias_match(uuid, text, double precision);--> statement-breakpoint
DROP TYPE "public"."category";--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('groceries', 'dining', 'housing', 'utilities', 'transport', 'entertainment', 'shopping', 'health', 'subscriptions', 'income', 'transfer', 'other');--> statement-breakpoint
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
