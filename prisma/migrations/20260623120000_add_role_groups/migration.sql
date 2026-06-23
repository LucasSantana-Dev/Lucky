-- Role Groups: a first-class entity wrapping one reaction-role message with a
-- shared, editable style template. Additive; the FK on reaction_role_messages is
-- nullable so existing rows become groupId = NULL ("ungrouped") with no backfill.
-- The unique index on groupId enforces the v1 one-message-per-group (1:1) rule
-- (NULLs are distinct in Postgres, so many ungrouped messages are allowed).

-- CreateTable
CREATE TABLE "role_groups" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "hoist" BOOLEAN NOT NULL DEFAULT false,
    "mentionable" BOOLEAN NOT NULL DEFAULT false,
    "buttonStyle" TEXT,
    "defaultEmoji" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_groups_guildId_idx" ON "role_groups"("guildId");

-- AlterTable
ALTER TABLE "reaction_role_messages" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "reaction_role_messages_groupId_key" ON "reaction_role_messages"("groupId");

-- AddForeignKey
ALTER TABLE "role_groups" ADD CONSTRAINT "role_groups_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reaction_role_messages" ADD CONSTRAINT "reaction_role_messages_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "role_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
