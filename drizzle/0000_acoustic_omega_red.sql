CREATE TYPE "public"."category" AS ENUM('groceries', 'dining', 'rent', 'utilities', 'transport', 'entertainment', 'shopping', 'health', 'subscriptions', 'income', 'transfer', 'other');--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" "category" NOT NULL,
	"monthly_cap_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"description" text NOT NULL,
	"category" "category",
	"amount_cents" integer NOT NULL,
	"transaction_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_user_category_uniq" ON "budgets" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "transactions_user_date_idx" ON "transactions" USING btree ("user_id","transaction_date");--> statement-breakpoint
CREATE POLICY "budgets_select_own" ON "budgets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.uid()) = "budgets"."user_id");--> statement-breakpoint
CREATE POLICY "budgets_insert_own" ON "budgets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.uid()) = "budgets"."user_id");--> statement-breakpoint
CREATE POLICY "budgets_update_own" ON "budgets" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.uid()) = "budgets"."user_id") WITH CHECK ((select auth.uid()) = "budgets"."user_id");--> statement-breakpoint
CREATE POLICY "budgets_delete_own" ON "budgets" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.uid()) = "budgets"."user_id");--> statement-breakpoint
CREATE POLICY "transactions_select_own" ON "transactions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.uid()) = "transactions"."user_id");--> statement-breakpoint
CREATE POLICY "transactions_insert_own" ON "transactions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.uid()) = "transactions"."user_id");--> statement-breakpoint
CREATE POLICY "transactions_update_own" ON "transactions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.uid()) = "transactions"."user_id") WITH CHECK ((select auth.uid()) = "transactions"."user_id");--> statement-breakpoint
CREATE POLICY "transactions_delete_own" ON "transactions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.uid()) = "transactions"."user_id");