CREATE TABLE "bank_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"basiq_user_id" text NOT NULL,
	"basiq_connection_id" text NOT NULL,
	"institution_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "basiq_transaction_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "is_transfer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_connections_user_basiq_uniq" ON "bank_connections" USING btree ("user_id","basiq_connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_basiq_id_uniq" ON "transactions" USING btree ("basiq_transaction_id") WHERE "transactions"."basiq_transaction_id" is not null;--> statement-breakpoint
CREATE POLICY "bank_connections_select_own" ON "bank_connections" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.uid()) = "bank_connections"."user_id");--> statement-breakpoint
CREATE POLICY "bank_connections_insert_own" ON "bank_connections" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.uid()) = "bank_connections"."user_id");--> statement-breakpoint
CREATE POLICY "bank_connections_update_own" ON "bank_connections" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.uid()) = "bank_connections"."user_id") WITH CHECK ((select auth.uid()) = "bank_connections"."user_id");--> statement-breakpoint
CREATE POLICY "bank_connections_delete_own" ON "bank_connections" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.uid()) = "bank_connections"."user_id");