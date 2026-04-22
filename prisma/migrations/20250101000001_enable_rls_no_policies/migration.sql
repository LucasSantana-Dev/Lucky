-- Enable RLS on every public table so PostgREST's anon/authenticated roles
-- cannot reach them. The bot/backend connects as the postgres role, which
-- bypasses RLS. No policies needed — default-deny is exactly what we want
-- until a separate follow-up introduces supabase-js / browser-side clients.
--
-- No-op on self-hosted Postgres (non-Supabase): ENABLE RLS without any
-- policies means only the owning role can read/write, which is how
-- self-hosted already behaves (single DB user). Safe to apply everywhere.

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."guilds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."guild_feature_toggles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."twitch_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."guild_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."guild_role_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."guild_automation_manifests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."guild_automation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."guild_automation_drifts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."guild_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."track_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."command_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."downloads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_artist_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."recommendations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."reaction_role_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."reaction_role_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lastfm_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."spotify_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."role_exclusions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."moderation_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."moderation_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."automod_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."embed_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."auto_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."custom_commands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."server_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."starboard_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."starboard_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."level_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."member_xp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."level_rewards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."live_boards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."auto_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."member_birthdays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."guild_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."stripe_webhook_events" ENABLE ROW LEVEL SECURITY;
