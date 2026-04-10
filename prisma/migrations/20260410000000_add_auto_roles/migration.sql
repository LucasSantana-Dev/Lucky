-- CreateTable
CREATE TABLE "auto_roles" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auto_roles_guildId_roleId_key" ON "auto_roles"("guildId", "roleId");

-- CreateIndex
CREATE INDEX "auto_roles_guildId_idx" ON "auto_roles"("guildId");
