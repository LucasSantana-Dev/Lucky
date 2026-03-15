import type { CustomClient } from '../../types'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { redisClient } from '@lucky/shared/services'
import { errorLog, infoLog, warnLog } from '@lucky/shared/utils'
import { musicSessionSnapshotService } from './sessionSnapshots'

const SESSION_KEY_PREFIX = 'music:session:'
const STARTUP_MAX_AGE_MS = 30 * 60 * 1_000 // 30 minutes

/**
 * Scans Redis for guild session snapshots and attempts to restore each one
 * by rejoining the stored voice channel and re-queuing tracks.
 *
 * Called once from clientReady. Per-guild errors are isolated so one failure
 * does not abort the entire sweep.
 */
export async function restoreSessionsOnStartup(client: CustomClient): Promise<void> {
    if (!ENVIRONMENT_CONFIG.MUSIC.SESSION_RESTORE_ENABLED) return

    let keys: string[]
    try {
        keys = await redisClient.keys(`${SESSION_KEY_PREFIX}*`)
    } catch (error) {
        errorLog({ message: 'Startup session sweep: failed to scan Redis keys', error })
        return
    }

    if (keys.length === 0) return

    infoLog({ message: `Startup session sweep: found ${keys.length} snapshot(s)` })

    for (const key of keys) {
        const guildId = key.slice(SESSION_KEY_PREFIX.length)

        try {
            const guild = client.guilds.cache.get(guildId)
            if (!guild) {
                warnLog({
                    message: 'Startup session sweep: guild not in cache, skipping',
                    data: { guildId },
                })
                continue
            }

            const snapshot = await musicSessionSnapshotService.getSnapshot(guildId)
            if (!snapshot) continue

            if (!snapshot.voiceChannelId) {
                warnLog({
                    message: 'Startup session sweep: snapshot missing voiceChannelId, skipping',
                    data: { guildId },
                })
                continue
            }

            const ageMs = Date.now() - snapshot.savedAt
            if (ageMs > STARTUP_MAX_AGE_MS) {
                await musicSessionSnapshotService.deleteSnapshot(guildId)
                warnLog({
                    message: 'Startup session sweep: stale snapshot deleted',
                    data: { guildId, ageMs, maxAgeMs: STARTUP_MAX_AGE_MS },
                })
                continue
            }

            const channel = guild.channels.cache.get(snapshot.voiceChannelId)
            if (!channel?.isVoiceBased()) {
                warnLog({
                    message: 'Startup session sweep: voice channel not found or not voice-based',
                    data: { guildId, voiceChannelId: snapshot.voiceChannelId },
                })
                continue
            }

            const queue = client.player.nodes.create(guild, {
                metadata: { channel: null, requestedBy: null },
            })

            if (!queue.connection) {
                await queue.connect(channel)
            }

            const result = await musicSessionSnapshotService.restoreSnapshot(queue, undefined, {
                maxAgeMs: STARTUP_MAX_AGE_MS,
            })

            if (result.restoredCount > 0) {
                infoLog({
                    message: 'Startup session sweep: restored snapshot',
                    data: {
                        guildId,
                        restoredCount: result.restoredCount,
                        sessionSnapshotId: result.sessionSnapshotId,
                    },
                })
            }
        } catch (error) {
            errorLog({
                message: 'Startup session sweep: failed to restore snapshot for guild',
                error,
                data: { guildId },
            })
        }
    }
}
