CREATE TYPE "public"."alert_kind" AS ENUM('transaction_anomaly', 'price_change', 'pending_over_budget', 'income_late');--> statement-breakpoint
CREATE TYPE "public"."alert_severity" AS ENUM('info', 'warn', 'critical');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('open', 'resolved', 'dismissed', 'snoozed');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "alert_kind" NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"source_transaction_id" uuid,
	"source_recurring_id" uuid,
	"dedup_key" text NOT NULL,
	"status" "alert_status" DEFAULT 'open' NOT NULL,
	"snooze_until" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_source_transaction_id_transactions_id_fk" FOREIGN KEY ("source_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_source_recurring_id_recurring_expenses_id_fk" FOREIGN KEY ("source_recurring_id") REFERENCES "public"."recurring_expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_user_dedup_uniq" ON "alerts" USING btree ("user_id","dedup_key");--> statement-breakpoint
CREATE INDEX "alerts_user_status_idx" ON "alerts" USING btree ("user_id","status");--> statement-breakpoint
CREATE POLICY "alerts_select_own" ON "alerts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.uid()) = "alerts"."user_id");--> statement-breakpoint
CREATE POLICY "alerts_insert_own" ON "alerts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.uid()) = "alerts"."user_id");--> statement-breakpoint
CREATE POLICY "alerts_update_own" ON "alerts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.uid()) = "alerts"."user_id") WITH CHECK ((select auth.uid()) = "alerts"."user_id");--> statement-breakpoint
CREATE POLICY "alerts_delete_own" ON "alerts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.uid()) = "alerts"."user_id");