-- New activation event kind: the one reminder sent to a guild that added
-- Lucky and played nothing in its first day. Only the CHECK list changes.
ALTER TABLE "activation_events" DROP CONSTRAINT IF EXISTS "activation_events_kind_check";
ALTER TABLE "activation_events" ADD CONSTRAINT "activation_events_kind_check" CHECK ("kind" IN ('onboarding_delivered', 'onboarding_failed', 'station_click', 'recap_auto_enabled', 'first_play_reminder'));
