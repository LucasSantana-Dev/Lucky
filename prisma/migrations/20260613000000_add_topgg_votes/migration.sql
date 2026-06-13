-- CreateTable "topgg_votes"
CREATE TABLE "topgg_votes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastVoteAt" TIMESTAMP(3) NOT NULL,
    "streak" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topgg_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "topgg_votes_userId_key" ON "topgg_votes"("userId");
