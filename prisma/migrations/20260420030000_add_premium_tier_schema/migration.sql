-- CreateTable
CREATE TABLE "guild_subscriptions" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "status" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "priceId" TEXT,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "guild_subscriptions_guildId_key" ON "guild_subscriptions"("guildId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "guild_subscriptions_stripeSubscriptionId_key" ON "guild_subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "guild_subscriptions_guildId_idx" ON "guild_subscriptions"("guildId");

-- CreateIndex
CREATE INDEX "guild_subscriptions_status_idx" ON "guild_subscriptions"("status");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "stripe_webhook_events_eventId_key" ON "stripe_webhook_events"("eventId");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_type_createdAt_idx" ON "stripe_webhook_events"("type", "createdAt");
