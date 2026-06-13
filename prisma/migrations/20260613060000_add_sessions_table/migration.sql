-- CreateTable "sessions"
-- Web dashboard session store (express-session), moved off Redis per ADR
-- 2026-05-31-redis-scope-reduction (#1111). Backed by PrismaSessionStore.
CREATE TABLE "sessions" (
    "sid" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE INDEX "idx_sessions_expires_at" ON "sessions"("expiresAt");
