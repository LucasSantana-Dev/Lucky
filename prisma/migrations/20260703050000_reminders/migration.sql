-- CreateTable for Reminder
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for scheduler lookups
CREATE INDEX "reminders_delivered_remindAt_idx" ON "reminders"("delivered", "remindAt");

-- CreateIndex for user lookups
CREATE INDEX "reminders_userId_remindAt_idx" ON "reminders"("userId", "remindAt");
