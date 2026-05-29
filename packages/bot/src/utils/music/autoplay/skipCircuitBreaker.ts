import type { GuildQueue } from 'discord-player'
import { getAutoplaySkipRateForGuild } from '@lucky/shared/services/recommendationTelemetryReadService'
import { debugLog, warnLog } from '@lucky/shared/utils'
import type { QueueMetadata } from '../../../types/QueueMetadata'

// Default threshold: 60% skip rate pauses autoplay
const AUTOPLAY_SKIP_BREAKER_THRESHOLD = 0.6

// In-memory pause state: maps guildId -> { isPaused: boolean; notified: boolean }
const autoplayPauseState = new Map<
    string,
    { isPaused: boolean; notified: boolean }
>()

/**
 * Checks if autoplay is currently paused for this guild.
 */
export function isAutoplayPaused(guildId: string): boolean {
    return autoplayPauseState.get(guildId)?.isPaused ?? false
}

/**
 * Clears the autoplay pause state for a guild (used on manual /play).
 */
export function clearAutoplayPause(guildId: string): void {
    if (autoplayPauseState.has(guildId)) {
        autoplayPauseState.delete(guildId)
        debugLog({
            message: 'Autoplay pause cleared',
            data: { guildId },
        })
    }
}

/**
 * Evaluates and applies the skip-rate circuit breaker.
 * Returns false if autoplay should be paused, true if replenishment should proceed.
 * Posts ONE notice to the music channel if the breaker trips.
 */
export async function evaluateSkipRateBreaker(
    queue: GuildQueue,
): Promise<boolean> {
    const guildId = queue.guild.id
    const metadata = queue.metadata as QueueMetadata | undefined
    const musicChannel = metadata?.channel

    // Check current pause state
    const currentState = autoplayPauseState.get(guildId)
    if (currentState?.isPaused) {
        return false // Stay paused
    }

    try {
        const skipRateData = await getAutoplaySkipRateForGuild(guildId)

        // Only trip if sample is sufficient and skip rate exceeds threshold
        if (
            skipRateData.canTrip &&
            skipRateData.skipRate !== null &&
            skipRateData.skipRate > AUTOPLAY_SKIP_BREAKER_THRESHOLD
        ) {
            // Trip the breaker
            autoplayPauseState.set(guildId, { isPaused: true, notified: false })

            // Post notice to music channel (once per pause)
            if (musicChannel) {
                try {
                    await musicChannel.send({
                        content: `⏸️ **Autoplay paused** — High skip rate detected (${(skipRateData.skipRate * 100).toFixed(0)}%). Play a track manually to resume.`,
                    })
                    autoplayPauseState.set(guildId, {
                        isPaused: true,
                        notified: true,
                    })
                    debugLog({
                        message: 'Skip-rate breaker tripped and notice posted',
                        data: {
                            guildId,
                            skipRate: skipRateData.skipRate,
                            sampleSize: skipRateData.sampleSize,
                        },
                    })
                } catch (noticeError) {
                    warnLog({
                        message: 'Failed to post autoplay pause notice',
                        error: noticeError,
                        data: { guildId },
                    })
                    // Still pause even if notice fails
                    autoplayPauseState.set(guildId, {
                        isPaused: true,
                        notified: false,
                    })
                }
            } else {
                // No channel, but still pause
                autoplayPauseState.set(guildId, {
                    isPaused: true,
                    notified: false,
                })
            }

            return false // Don't replenish
        }

        return true // Proceed with replenishment
    } catch (error) {
        warnLog({
            message: 'Error evaluating skip-rate breaker',
            error,
            data: { guildId },
        })
        // Fail open: allow replenishment on error
        return true
    }
}
