-- CreateTable SpotifyLink
CREATE TABLE "spotify_links" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "spotifyId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "spotifyUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spotify_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spotify_links_discordId_key" ON "spotify_links"("discordId");
