CREATE TYPE "public"."recurring_direction" AS ENUM('expense', 'income');--> statement-breakpoint
DROP INDEX "recurring_expenses_user_merchant_cadence_uniq";--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD COLUMN "direction" "recurring_direction" DEFAULT 'expense' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "monthly_savings_target_cents" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_expenses_user_merchant_cadence_dir_uniq" ON "recurring_expenses" USING btree ("user_id","merchant_name","cadence","direction");