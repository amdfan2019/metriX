CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant', 'tool', 'system');--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "chat_role" NOT NULL,
	"content" text,
	"tool_calls" jsonb,
	"tool_name" text,
	"tool_response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "daily_briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"briefing_date" date NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_briefings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"monthly_income_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_session_created_idx" ON "chat_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_sessions_user_updated_idx" ON "chat_sessions" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_briefings_user_date_uniq" ON "daily_briefings" USING btree ("user_id","briefing_date");--> statement-breakpoint
CREATE POLICY "chat_messages_select_own" ON "chat_messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.uid()) = "chat_messages"."user_id");--> statement-breakpoint
CREATE POLICY "chat_messages_insert_own" ON "chat_messages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.uid()) = "chat_messages"."user_id");--> statement-breakpoint
CREATE POLICY "chat_messages_delete_own" ON "chat_messages" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.uid()) = "chat_messages"."user_id");--> statement-breakpoint
CREATE POLICY "chat_sessions_select_own" ON "chat_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.uid()) = "chat_sessions"."user_id");--> statement-breakpoint
CREATE POLICY "chat_sessions_insert_own" ON "chat_sessions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.uid()) = "chat_sessions"."user_id");--> statement-breakpoint
CREATE POLICY "chat_sessions_update_own" ON "chat_sessions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.uid()) = "chat_sessions"."user_id") WITH CHECK ((select auth.uid()) = "chat_sessions"."user_id");--> statement-breakpoint
CREATE POLICY "chat_sessions_delete_own" ON "chat_sessions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.uid()) = "chat_sessions"."user_id");--> statement-breakpoint
CREATE POLICY "daily_briefings_select_own" ON "daily_briefings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.uid()) = "daily_briefings"."user_id");--> statement-breakpoint
CREATE POLICY "daily_briefings_insert_own" ON "daily_briefings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.uid()) = "daily_briefings"."user_id");--> statement-breakpoint
CREATE POLICY "daily_briefings_update_own" ON "daily_briefings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.uid()) = "daily_briefings"."user_id") WITH CHECK ((select auth.uid()) = "daily_briefings"."user_id");--> statement-breakpoint
CREATE POLICY "daily_briefings_delete_own" ON "daily_briefings" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.uid()) = "daily_briefings"."user_id");--> statement-breakpoint
CREATE POLICY "user_settings_select_own" ON "user_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.uid()) = "user_settings"."user_id");--> statement-breakpoint
CREATE POLICY "user_settings_insert_own" ON "user_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select auth.uid()) = "user_settings"."user_id");--> statement-breakpoint
CREATE POLICY "user_settings_update_own" ON "user_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select auth.uid()) = "user_settings"."user_id") WITH CHECK ((select auth.uid()) = "user_settings"."user_id");--> statement-breakpoint
CREATE POLICY "user_settings_delete_own" ON "user_settings" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((select auth.uid()) = "user_settings"."user_id");