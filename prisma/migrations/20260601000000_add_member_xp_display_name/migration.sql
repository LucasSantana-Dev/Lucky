-- Denormalized display name (guild nickname -> global name -> username) captured at
-- XP-grant time, so the leaderboard renders names instead of raw Discord user IDs.
ALTER TABLE "member_xp" ADD COLUMN "displayName" TEXT;
