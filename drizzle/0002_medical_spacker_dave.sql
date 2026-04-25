CREATE TYPE "public"."alias_source" AS ENUM('user', 'gemini');--> statement-breakpoint
CREATE TABLE "merchant_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"raw_description" text NOT NULL,
	"merchant_name" text NOT NULL,
	"category" "category" NOT NULL,
	"source" "alias_source" NOT NULL,
	"confidence" numeric(4, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merchant_aliases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "transactions_basiq_id_uniq";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "merchant_name" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "confidence" numeric(4, 3);--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_aliases_user_raw_uniq" ON "merchant_aliases" USING btree ("user_id","raw_description");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_basiq_id_uniq" ON "transactions" USING btree ("basiq_transaction_id");--> statement-breakpoint
CREATE POLICY "merchant_aliases_select_own" ON "merchant_aliases" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.uid()) = "merchant_aliases"."user_id");--> statement-breakpoint
CREATE POLICY "merchant_aliases_insert_own" ON "merchant_aliases" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.uid()) = "merchant_aliases"."user_id");--> statement-breakpoint
CREATE POLICY "merchant_aliases_update_own" ON "merchant_aliases" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.uid()) = "merchant_aliases"."user_id") WITH CHECK ((select auth.uid()) = "merchant_aliases"."user_id");--> statement-breakpoint
CREATE POLICY "merchant_aliases_delete_own" ON "merchant_aliases" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.uid()) = "merchant_aliases"."user_id");