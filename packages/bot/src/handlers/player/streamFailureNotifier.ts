import type { GuildQueue } from 'discord-player'
import { debugLog } from '@lucky/shared/utils'
import { createErrorEmbed } from '../../utils/general/embeds'
import type { QueueMetadata } from '../../types/QueueMetadata'

// decisions/2026-09-27-music-first-positioning.md: never name the audio
// source. No region excuse either: since 2026-10-19 most misses are YouTube
// blocking the bot, not the listener's region. No skip claim: discord-player
// has already moved on by the time this is sent (see streamRecovery.ts).
export function streamFailedDescription(trackTitle: string): string {
    return `Couldn't find the original of **${trackTitle || 'this track'}** right now, so I'm not playing a cover. Try again shortly or paste a link.`
}

// Per guild: the first failure posts at once and opens a window; failures
// inside it are only counted, and one summary closes it (#2975). During a
// breaker-open window a long session otherwise gets one embed per skipped
// track.
export const STREAM_FAILURE_COOLDOWN_MS = 60_000

interface FailureWindow {
    timer: ReturnType<typeof setTimeout>
    held: number
    queue: GuildQueue
}

const failureWindows = new Map<string, FailureWindow>()

export function resetStreamFailureCooldowns(): void {
    for (const window of failureWindows.values()) clearTimeout(window.timer)
    failureWindows.clear()
}

async function flushFailureWindow(guildId: string): Promise<void> {
    const window = failureWindows.get(guildId)
    if (!window) return
    clearTimeout(window.timer)
    failureWindows.delete(guildId)
    if (window.held === 0) return
    const { held, queue } = window
    const channel = (queue.metadata as QueueMetadata | undefined)?.channel
    if (!channel) return
    try {
        await channel.send({
            embeds: [
                createErrorEmbed(
                    '⚠️ Could not play tracks',
                    `${held} ${held === 1 ? 'track' : 'tracks'} could not be played. Try again shortly or paste a link.`,
                ),
            ],
        })
    } catch (error) {
        debugLog({
            message: 'Failed to notify channel about stream failures',
            error,
            data: { guildId, held },
        })
    }
}

export async function notifyChannelStreamFailed(
    queue: GuildQueue,
    trackTitle: string,
): Promise<void> {
    const channel = (queue.metadata as QueueMetadata | undefined)?.channel
    if (!channel) return
    const guildId = queue.guild.id
    const open = failureWindows.get(guildId)
    if (open) {
        open.held += 1
        open.queue = queue
        return
    }
    const timer = setTimeout(() => {
        void flushFailureWindow(guildId)
    }, STREAM_FAILURE_COOLDOWN_MS)
    timer.unref?.()
    failureWindows.set(guildId, { timer, held: 0, queue })
    try {
        await channel.send({
            embeds: [
                createErrorEmbed(
                    '⚠️ Could not play track',
                    streamFailedDescription(trackTitle),
                ),
            ],
        })
    } catch (error) {
        debugLog({
            message: 'Failed to notify channel about stream failure',
            error,
            data: { guildId, trackTitle },
        })
    }
}

export async function notifyChannelAutoplayStopped(
    queue: GuildQueue,
    failedCount: number,
): Promise<void> {
    const channel = (queue.metadata as QueueMetadata | undefined)?.channel
    if (!channel) return
    try {
        await channel.send({
            embeds: [
                createErrorEmbed(
                    '⚠️ Autoplay stopped',
                    `The last ${failedCount} autoplay tracks could not be streamed from any source, so autoplay stopped. Use /play to start again.`,
                ),
            ],
        })
    } catch (error) {
        debugLog({
            message: 'Failed to notify channel that autoplay stopped',
            error,
            data: { guildId: queue.guild.id, failedCount },
        })
    }
}
