-- Smart custom commands: auto-tag reaction-role roles from user input and
-- optionally post to a target channel.
ALTER TABLE "custom_commands" ADD COLUMN "smartTags" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "custom_commands" ADD COLUMN "targetChannelId" TEXT;
