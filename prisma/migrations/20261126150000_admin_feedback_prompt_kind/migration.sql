-- New activation event kind: the question Lucky asks a guild admin, at most
-- once every 30 days, about what is missing. Only the CHECK list changes.
ALTER TABLE "activation_events" DROP CONSTRAINT IF EXISTS "activation_events_kind_check";
ALTER TABLE "activation_events" ADD CONSTRAINT "activation_events_kind_check" CHECK ("kind" IN ('onboarding_delivered', 'onboarding_failed', 'station_click', 'recap_auto_enabled', 'first_play_reminder', 'admin_feedback_prompt'));
