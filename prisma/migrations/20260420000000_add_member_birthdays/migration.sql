-- CreateTable
CREATE TABLE "member_birthdays" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_birthdays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_birthdays_guildId_month_day_idx" ON "member_birthdays"("guildId", "month", "day");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "member_birthdays_guildId_userId_key" ON "member_birthdays"("guildId", "userId");
