CREATE TYPE "public"."cadence" AS ENUM('weekly', 'fortnightly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."recurring_source" AS ENUM('detected', 'manual');--> statement-breakpoint
CREATE TYPE "public"."recurring_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "recurring_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"merchant_name" text NOT NULL,
	"category" "category" NOT NULL,
	"cadence" "cadence" NOT NULL,
	"typical_amount_cents" integer NOT NULL,
	"min_amount_cents" integer NOT NULL,
	"max_amount_cents" integer NOT NULL,
	"first_seen_date" date,
	"last_seen_date" date,
	"next_expected_date" date NOT NULL,
	"leg_count" integer DEFAULT 0 NOT NULL,
	"status" "recurring_status" DEFAULT 'active' NOT NULL,
	"source" "recurring_source" DEFAULT 'detected' NOT NULL,
	"ignored" boolean DEFAULT false NOT NULL,
	"confidence" numeric(4, 3),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurring_expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recurring_expense_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_expenses_user_merchant_cadence_uniq" ON "recurring_expenses" USING btree ("user_id","merchant_name","cadence");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_expense_id_recurring_expenses_id_fk" FOREIGN KEY ("recurring_expense_id") REFERENCES "public"."recurring_expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "recurring_expenses_select_own" ON "recurring_expenses" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.uid()) = "recurring_expenses"."user_id");--> statement-breakpoint
CREATE POLICY "recurring_expenses_insert_own" ON "recurring_expenses" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.uid()) = "recurring_expenses"."user_id");--> statement-breakpoint
CREATE POLICY "recurring_expenses_update_own" ON "recurring_expenses" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.uid()) = "recurring_expenses"."user_id") WITH CHECK ((select auth.uid()) = "recurring_expenses"."user_id");--> statement-breakpoint
CREATE POLICY "recurring_expenses_delete_own" ON "recurring_expenses" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.uid()) = "recurring_expenses"."user_id");