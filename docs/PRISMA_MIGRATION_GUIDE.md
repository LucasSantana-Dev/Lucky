# Prisma Migration Guide — Lucky

This document covers running Prisma migrations on the Lucky homelab database.

## Setup

Lucky uses **Prisma 7** with a PostgreSQL database. Schema lives at `prisma/schema.prisma`. Migrations are in `prisma/migrations/`.

Environment variable required:

```
DATABASE_URL=postgresql://user:password@host:5432/lucky
```

On the homelab this is set in the bot/backend Docker Compose env files or `.env`.

## Running migrations

```bash
# Apply all pending migrations
npx prisma migrate deploy

# Check migration status
npx prisma migrate status

# Generate Prisma client after schema changes
npx prisma generate
```

`migrate deploy` is the correct command for production/homelab — it applies pending migrations without prompting and never creates new ones.

## v2.8.0 — GlobalFeatureToggle table

Migration: `20260504000000_add_global_feature_toggles`

```sql
CREATE TABLE "global_feature_toggles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    CONSTRAINT "global_feature_toggles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "global_feature_toggles_name_key" ON "global_feature_toggles"("name");
```

**Purpose:** Stores per-flag DB overrides for the feature toggle system. The `FeatureToggleService` resolution order is: DB override → Vercel Flags → env fallback. When a row exists for a flag name, it takes precedence over Vercel/env values.

**Populated by:** The admin panel (`POST /api/toggles/global/:name`) or directly via Prisma upsert. Table starts empty — all flags fall through to Vercel/env until explicitly overridden.

**Flags:** 19 flags defined in `packages/shared/src/config/featureToggles.ts` (AUTOPLAY, LYRICS, MUSIC_RECOMMENDATIONS, ARTIST_COMMAND, ALBUM_COMMAND, etc.).

## Applying the v2.8.0 migration on homelab

```bash
# On the homelab server (or via SSH)
cd /path/to/Lucky
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

Expected output:
```
Applying migration `20260504000000_add_global_feature_toggles`
The following migration(s) have been applied:
  migrations/
    └─ 20260504000000_add_global_feature_toggles/
      └─ migration.sql
```

After applying, restart the backend service so the new table is available.

## Baseline migration note

The project uses a baseline migration (`20250101000000_baseline`) that captures the pre-Prisma schema state. If setting up a new database from scratch, Prisma will apply all migrations in order, including the baseline. For an existing database that predates Prisma migration tracking, mark the baseline as applied first:

```bash
npx prisma migrate resolve --applied 20250101000000_baseline
```

Then run `migrate deploy` to apply only the subsequent migrations.
