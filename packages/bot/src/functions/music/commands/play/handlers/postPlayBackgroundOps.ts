import type { GuildQueue, Track } from 'discord-player'
import { QueueRepeatMode } from 'discord-player'
import { errorLog } from '@lucky/shared/utils'
import { addBreadcrumb } from '@lucky/shared/utils/monitoring'
import { blendAutoplayTracks } from '../../../../../utils/music/queueManipulation'
import { applyStoredAutoplayPreference } from './autoplayPreference'
import { clearAutoplayPause } from '../../../../../utils/music/autoplay/skipCircuitBreaker'
import { clearSessionMoodCache } from '../../../../../utils/music/autoplay/replenisher'

export interface PostPlayBackgroundOpsInput {
    queue: GuildQueue | null | undefined
    guildId: string
    track: Track
    hadQueueBeforePlay: boolean
    isPlaylist: boolean
}

const AUTOPLAY_PREFERENCE_RETRY_DELAY_MS = 150

/**
 * Runs one post-play background op in isolation. A failure is recorded (telemetry
 * breadcrumb + error log) but NEVER cascades to the other ops — fixing #1085, where
 * a single shared try/catch meant a `clearAutoplayPause` or preference-load failure
 * silently skipped the remaining work.
 */
async function runIsolated(
    op: string,
    guildId: string,
    fn: () => void | Promise<void>,
): Promise<void> {
    try {
        await fn()
    } catch (error) {
        try {
            addBreadcrumb('post_play_bg_op_failed', 'play', 'warning', {
                op,
                guildId,
            })
        } catch {
            // Observability must never break the handler.
        }
        errorLog({
            message: `Post-play background op failed: ${op}`,
            error,
            data: { guildId, op },
        })
    }
}

/**
 * Retries a transient op once (2 attempts total) with a short backoff. Used for the
 * stored-autoplay-preference read, which can fail transiently on a slow DB. The final
 * failure (if any) is surfaced to the caller's `runIsolated`.
 */
async function withSingleRetry(fn: () => Promise<void>): Promise<void> {
    try {
        await fn()
    } catch {
        await new Promise((resolve) =>
            setTimeout(resolve, AUTOPLAY_PREFERENCE_RETRY_DELAY_MS),
        )
        await fn()
    }
}

/**
 * Post-play background work, dispatched fire-and-forget by the play handler. Each op
 * is isolated so one failure never silently skips the others.
 */
export async function runPostPlayBackgroundOps(
    input: PostPlayBackgroundOpsInput,
): Promise<void> {
    const { queue, guildId, track, hadQueueBeforePlay, isPlaylist } = input

    await runIsolated('clearAutoplayPause', guildId, () =>
        clearAutoplayPause(guildId),
    )

    await runIsolated('clearSessionMoodCache', guildId, () =>
        clearSessionMoodCache(guildId),
    )

    if (!hadQueueBeforePlay && queue) {
        await runIsolated('applyStoredAutoplayPreference', guildId, () =>
            withSingleRetry(() =>
                applyStoredAutoplayPreference(queue, guildId),
            ),
        )
    }

    if (!isPlaylist && queue && queue.repeatMode === QueueRepeatMode.AUTOPLAY) {
        await runIsolated('blendAutoplayTracks', guildId, () =>
            blendAutoplayTracks(queue, track),
        )
    }
}
