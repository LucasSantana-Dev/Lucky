-- CreateTable
CREATE TABLE "lastfm_links" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "lastFmUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lastfm_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lastfm_links_discordId_key" ON "lastfm_links"("discordId");
