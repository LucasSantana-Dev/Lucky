-- 24/7 mode (/247): when on, Lucky stays in the voice channel after the queue
-- ends or the channel empties. Additive column, off for every existing guild.
ALTER TABLE "guild_settings" ADD COLUMN IF NOT EXISTS "stayConnected" BOOLEAN NOT NULL DEFAULT false;
