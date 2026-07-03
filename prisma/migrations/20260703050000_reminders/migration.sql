-- CreateTable for Reminder
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for scheduler lookups
CREATE INDEX "reminders_remindAt_delivered_idx" ON "reminders"("remindAt", "delivered");

-- CreateIndex for user lookups
CREATE INDEX "reminders_userId_idx" ON "reminders"("userId");
