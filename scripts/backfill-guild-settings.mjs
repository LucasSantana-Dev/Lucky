/**
 * One-time backfill: Redis guild settings -> Postgres `guild_settings`.
 *
 * Context: GuildSettingsService moved from Redis (key `guild_settings:{guildId}`,
 * 7-day TTL) to Postgres source-of-truth
 * (decisions/2026-05-31-guild-settings-postgres-source-of-truth.md).
 * Run this ONCE, BEFORE deploying the new code, so live settings aren't lost.
 * Idempotent: re-running upserts the same rows. Guilds whose Redis key already
 * expired simply aren't present -> they fall back to model defaults (acceptable).
 *
 * Birthday columns are NOT touched (upsert only sets the settings fields), so
 * the existing Postgres birthday data is preserved.
 *
 * Usage:
 *   REDIS_HOST=... REDIS_PORT=... DATABASE_URL=... node scripts/backfill-guild-settings.mjs
 *   (add --dry-run to preview without writing)
 */
import Redis from 'ioredis'
import { PrismaPg } from '@prisma/adapter-pg'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { PrismaClient } = require(
    '../packages/shared/src/generated/prisma/client.js',
)

const DRY_RUN = process.argv.includes('--dry-run')

// Only these fields belong to settings; everything else (birthday*) is left alone.
const SETTINGS_FIELDS = [
    'defaultVolume',
    'maxQueueSize',
    'autoPlayEnabled',
    'autoplayMode',
    'autoplayGenres',
    'repeatMode',
    'shuffleEnabled',
    'prefix',
    'embedColor',
    'language',
    'allowDownloads',
    'allowPlaylists',
    'allowSpotify',
    'commandCooldown',
    'downloadCooldown',
    'djRoleId',
    'idleTimeoutMinutes',
    'voteSkipThreshold',
]

function pickSettings(blob) {
    const out = {}
    for (const k of SETTINGS_FIELDS) {
        if (blob[k] !== undefined && blob[k] !== null) out[k] = blob[k]
    }
    return out
}

async function main() {
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) throw new Error('DATABASE_URL is required')

    const redis = new Redis({
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10),
        password: process.env.REDIS_PASSWORD,
        db: Number.parseInt(process.env.REDIS_DB ?? '0', 10),
        lazyConnect: true,
    })
    await redis.connect()
    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl }),
    })

    let scanned = 0
    let written = 0
    let skipped = 0
    try {
        // Settings keys are exactly `guild_settings:{guildId}` — exclude the
        // `:autoplay_counter` / `:repeat_count` / `:rate_limit:*` sub-keys.
        const stream = redis.scanStream({ match: 'guild_settings:*', count: 200 })
        for await (const keys of stream) {
            for (const key of keys) {
                const rest = key.slice('guild_settings:'.length)
                if (rest.includes(':')) continue // sub-key, not a settings blob
                scanned += 1
                const guildId = rest
                const raw = await redis.get(key)
                if (!raw) {
                    skipped += 1
                    continue
                }
                let blob
                try {
                    blob = JSON.parse(raw)
                } catch {
                    console.warn(`[skip] ${key}: unparseable JSON`)
                    skipped += 1
                    continue
                }
                const data = pickSettings(blob)
                if (DRY_RUN) {
                    console.log(`[dry] ${guildId}: would upsert`, Object.keys(data))
                    continue
                }
                await prisma.guildSettings.upsert({
                    where: { guildId },
                    create: { guildId, ...data },
                    update: data,
                })
                written += 1
            }
        }
    } finally {
        await redis.quit()
        await prisma.$disconnect()
    }

    console.log(
        `Backfill ${DRY_RUN ? '(dry-run) ' : ''}done: scanned=${scanned} written=${written} skipped=${skipped}`,
    )
}

main().catch((err) => {
    console.error('Backfill failed:', err)
    process.exit(1)
})
