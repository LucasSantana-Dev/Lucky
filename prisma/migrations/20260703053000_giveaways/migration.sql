-- CreateTable Giveaway
CREATE TABLE "giveaways" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "prize" TEXT NOT NULL,
    "winnersCount" INTEGER NOT NULL DEFAULT 1,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "winnerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "giveaways_pkey" PRIMARY KEY ("id")
);

-- CreateTable GiveawayEntry
CREATE TABLE "giveaway_entries" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "giveaway_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for Giveaway
CREATE INDEX "giveaways_guildId_idx" ON "giveaways"("guildId");
CREATE INDEX "giveaways_endsAt_idx" ON "giveaways"("endsAt");
CREATE UNIQUE INDEX "giveaways_messageId_key" ON "giveaways"("messageId");

-- CreateIndex for GiveawayEntry
CREATE UNIQUE INDEX "giveaway_entries_giveawayId_userId_key" ON "giveaway_entries"("giveawayId", "userId");

-- AddForeignKey
ALTER TABLE "giveaway_entries" ADD CONSTRAINT "giveaway_entries_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "giveaways"("id") ON DELETE CASCADE ON UPDATE CASCADE;
