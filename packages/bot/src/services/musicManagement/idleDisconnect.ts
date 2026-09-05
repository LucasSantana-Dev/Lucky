import type { GuildQueue } from 'discord-player'
import { guildSettingsService } from '@lucky/shared/services'
import { debugLog, errorLog, warnLog } from '@lucky/shared/utils'
import { musicWatchdogService } from './watchdog'
import { collaborativePlaylistService } from '../musicRecommendation/collaborativePlaylist'
import type { QueueMetadata } from '../../types/QueueMetadata'

const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()
// Bumped synchronously on every call so a later scheduleIdleDisconnect call
// can invalidate an earlier one that is still awaiting guild settings — see
// #2218 (two rapid calls could otherwise both survive to arm a timer).
const idleGenerations = new Map<string, number>()

// Deletes the guild's generation entry only if it still matches `generation`,
// so a completion/cancellation path can never wipe out a newer, still-live
// generation that superseded it.
function releaseGeneration(guildId: string, generation: number): void {
    if (idleGenerations.get(guildId) === generation) {
        idleGenerations.delete(guildId)
    }
}

function clearArmedTimer(guildId: string): void {
    const timer = idleTimers.get(guildId)
    if (timer) {
        clearTimeout(timer)
        idleTimers.delete(guildId)
    }
}

export function scheduleIdleDisconnect(queue: GuildQueue): void {
    const guildId = queue.guild.id
    // Each call claims the next generation unconditionally (never reusing
    // clearIdleTimer's own deletion) so two rapid calls always get distinct,
    // strictly increasing numbers instead of racing back to the same value.
    const generation = (idleGenerations.get(guildId) ?? 0) + 1
    idleGenerations.set(guildId, generation)
    clearArmedTimer(guildId)

    void (async () => {
        const settings = await guildSettingsService.getGuildSettings(guildId)
        // A newer call, or an explicit clearIdleTimer, superseded this one
        // while settings were loading — bail instead of arming a timer.
        if (idleGenerations.get(guildId) !== generation) return

        const timeoutMinutes = settings?.idleTimeoutMinutes ?? 0
        if (timeoutMinutes <= 0) {
            releaseGeneration(guildId, generation)
            return
        }

        debugLog({
            message: 'Idle disconnect scheduled',
            data: { guildId, timeoutMinutes },
        })

        const timer = setTimeout(
            () => {
                idleTimers.delete(guildId)
                releaseGeneration(guildId, generation)
                void disconnectIdle(queue)
            },
            timeoutMinutes * 60 * 1000,
        )

        idleTimers.set(guildId, timer)
    })().catch((error: unknown) => {
        releaseGeneration(guildId, generation)
        errorLog({
            message: `Failed to schedule idle disconnect in guild ${guildId}`,
            error,
        })
    })
}

export function clearIdleTimer(guildId: string): void {
    // Invalidate any schedule still awaiting settings, or already armed, for
    // this guild — e.g. playerStart calling this on playback resume must stop
    // a pending idle-disconnect from later killing live playback (#2218).
    //
    // Advance the counter instead of deleting it: deleting would let the
    // NEXT scheduleIdleDisconnect restart at generation 1, which can collide
    // with a still-pending (cleared) call's captured generation and let it
    // pass the equality check and arm a second timer. Only the identity
    // guarded releaseGeneration (fire/error paths) may delete the entry.
    idleGenerations.set(guildId, (idleGenerations.get(guildId) ?? 0) + 1)
    clearArmedTimer(guildId)
}

async function disconnectIdle(queue: GuildQueue): Promise<void> {
    const guildId = queue.guild.id
    debugLog({ message: 'Idle disconnect triggered', data: { guildId } })

    try {
        const metadata = queue.metadata as QueueMetadata | undefined
        musicWatchdogService.markIntentionalStop(guildId)
        queue.delete()
        // Clear collaborative state only after the queue is actually torn
        // down, so a delete failure doesn't reset state for a live session.
        collaborativePlaylistService.clearGuildState(guildId)

        if (metadata?.channel) {
            try {
                await metadata.channel.send(
                    '👋 Left the voice channel due to inactivity.',
                )
            } catch (error) {
                // Farewell message failures are cosmetic, so keep them at
                // debug: they can't mask a real teardown failure above.
                debugLog({
                    message: 'Failed to send idle disconnect farewell message',
                    data: { guildId, error: String(error) },
                })
            }
        }
    } catch (error) {
        warnLog({
            message: 'Error during idle disconnect',
            data: { guildId, error: String(error) },
        })
    }
}
