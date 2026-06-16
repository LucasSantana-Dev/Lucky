import type { CustomClient } from '../../types'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { errorLog, infoLog, warnLog } from '@lucky/shared/utils'
import { musicSessionSnapshotService } from './sessionSnapshots'

const STARTUP_MAX_AGE_MS = 30 * 60 * 1_000 // 30 minutes

/**
 * Restores guild session snapshots (now stored in Postgres) on startup by
 * rejoining the stored voice channel and re-queuing tracks.
 *
 * Called once from clientReady. Per-guild errors are isolated so one failure
 * does not abort the entire sweep.
 */
export async function restoreSessionsOnStartup(
    client: CustomClient,
): Promise<void> {
    if (!ENVIRONMENT_CONFIG.MUSIC.SESSION_RESTORE_ENABLED) return

    const guildIds = await musicSessionSnapshotService.listGuildIds()

    if (guildIds.length === 0) return

    infoLog({
        message: `Startup session sweep: found ${guildIds.length} snapshot(s)`,
    })

    for (const guildId of guildIds) {
        try {
            const guild = client.guilds.cache.get(guildId)
            if (!guild) {
                warnLog({
                    message:
                        'Startup session sweep: guild not in cache, skipping',
                    data: { guildId },
                })
                continue
            }

            const snapshot =
                await musicSessionSnapshotService.getSnapshot(guildId)
            if (!snapshot) continue

            if (!snapshot.voiceChannelId) {
                warnLog({
                    message:
                        'Startup session sweep: snapshot missing voiceChannelId, skipping',
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
                    message:
                        'Startup session sweep: voice channel not found or not voice-based',
                    data: { guildId, voiceChannelId: snapshot.voiceChannelId },
                })
                continue
            }

            // Do not rejoin + auto-play into an empty channel. Mirrors the
            // orphan-session watchdog's presence guard (watchdog.ts) so the bot
            // never surprises an empty room after a restart/redeploy.
            const humansPresent = channel.members.filter(
                (member) => !member.user.bot,
            ).size
            if (humansPresent === 0) {
                infoLog({
                    message:
                        'Startup session sweep: no humans in channel, skipping restore',
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

            const result = await musicSessionSnapshotService.restoreSnapshot(
                queue,
                undefined,
                {
                    maxAgeMs: STARTUP_MAX_AGE_MS,
                },
            )

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
                message:
                    'Startup session sweep: failed to restore snapshot for guild',
                error,
                data: { guildId },
            })
        }
    }
}
