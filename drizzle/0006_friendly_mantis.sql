CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"basiq_account_id" text NOT NULL,
	"basiq_user_id" text NOT NULL,
	"institution_name" text,
	"account_name" text,
	"account_number" text,
	"account_type" text,
	"account_class" text,
	"current_balance_cents" integer,
	"available_balance_cents" integer,
	"currency" text DEFAULT 'AUD' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"balance_as_of" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "cashflow_buffer_cents" integer DEFAULT 20000 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_basiq_uniq" ON "accounts" USING btree ("user_id","basiq_account_id");--> statement-breakpoint
CREATE POLICY "accounts_select_own" ON "accounts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.uid()) = "accounts"."user_id");--> statement-breakpoint
CREATE POLICY "accounts_insert_own" ON "accounts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.uid()) = "accounts"."user_id");--> statement-breakpoint
CREATE POLICY "accounts_update_own" ON "accounts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.uid()) = "accounts"."user_id") WITH CHECK ((select auth.uid()) = "accounts"."user_id");--> statement-breakpoint
CREATE POLICY "accounts_delete_own" ON "accounts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.uid()) = "accounts"."user_id");