import type { GuildQueue } from 'discord-player'
import type { Client, VoiceState } from 'discord.js'
import { ChannelType } from 'discord.js'
import { infoLog, debugLog, warnLog } from '@lucky/shared/utils'
import {
    createErrorEmbed,
    createWarningEmbed,
} from '../../utils/general/embeds'
import {
    ensureStageSpeaker,
    type StageSpeakerOutcome,
} from '../../services/musicManagement/stageSpeaker'
import type { CustomClient } from '../../types'
import * as voiceStatus from '../../services/VoiceChannelStatusService'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { musicWatchdogService } from '../../services/musicManagement/watchdog'
import { musicSessionSnapshotService } from '../../services/musicRecommendation/sessionSnapshots'
import { replenishQueue } from '../../services/musicManagement/queueOperations'
import { isReplenishSuppressed } from '../../services/musicManagement/replenishSuppressionStore'
import type { QueueMetadata } from '../../types/QueueMetadata'

export const setupVoiceKickDetection = (client: Client): void => {
    client.on('voiceStateUpdate', (oldState, newState) => {
        if (newState.member?.id !== client.user?.id) return
        const wasInChannel = Boolean(oldState.channelId)
        const nowDisconnected = !newState.channelId
        if (wasInChannel && nowDisconnected && oldState.guild) {
            musicWatchdogService.markIntentionalStop(oldState.guild.id)
            infoLog({
                message: `Bot was disconnected from voice in ${oldState.guild.name} — marked intentional`,
            })
        }
    })
}

const STAGE_NOTICES: Partial<
    Record<StageSpeakerOutcome, { title: string; body: string }>
> = {
    requested: {
        title: '🙋 Waiting for stage approval',
        body: "I joined the stage but Discord keeps bots in the audience, so nobody can hear me yet. I've raised my hand — a moderator needs to invite me to speak.",
    },
    blocked: {
        title: "🔇 I can't speak on this stage",
        body: 'I need **Request to Speak** (or **Mute Members**) on this stage channel. Grant either one and start playback again, or use a normal voice channel instead.',
    },
    failed: {
        title: "🔇 I couldn't get on stage",
        body: 'Discord rejected my request to speak on this stage. Try inviting me to speak manually, or use a normal voice channel instead.',
    },
}

async function notifyStageOutcome(
    queue: GuildQueue | undefined,
    outcome: StageSpeakerOutcome,
): Promise<void> {
    const notice = STAGE_NOTICES[outcome]
    if (!notice) return

    const channel = (queue?.metadata as QueueMetadata | undefined)?.channel
    if (!channel) {
        // Session restore builds queues with `metadata: { channel: null }`, so
        // there is nobody to tell. Log it rather than drop it: silent is the
        // exact failure mode this whole handler exists to end.
        warnLog({
            message: `Cannot explain stage outcome "${outcome}" in ${queue?.guild.name ?? 'unknown guild'}: queue has no text channel`,
            data: { guildId: queue?.guild.id, outcome },
        })
        return
    }

    const embed =
        outcome === 'requested'
            ? createWarningEmbed(notice.title, notice.body)
            : createErrorEmbed(notice.title, notice.body)

    try {
        await channel.send({ embeds: [embed] })
    } catch (error) {
        debugLog({
            message: 'Failed to notify channel about stage speaker outcome',
            error,
            data: { guildId: queue?.guild.id, outcome },
        })
    }
}

/**
 * Keep the bot audible on stage channels.
 *
 * Connecting to a `GuildStageVoice` channel succeeds and streams audio while
 * the bot sits suppressed in the audience — no error, no log, no sound. This
 * listener is the fix, and it hangs off `voiceStateUpdate` rather than the
 * player's `connection` event for two reasons: the voice state is fresh by
 * construction (no race against the gateway populating `members.me.voice`),
 * and it also catches a moderator revoking speaker mid-session, which the
 * connect path never sees.
 */
// Guilds whose queue THIS handler paused because the bot could not speak.
// Without it, approval would resume a queue a user had paused with /pause, and
// a bot moved off a stage while still suppressed would stay paused forever.
const stagePaused = new Set<string>()

/** Test seam: the set is module state and each test needs a clean one. */
export const __resetStagePausedForTests = (): void => {
    stagePaused.clear()
}

function resumeIfStagePaused(guildId: string, queue?: GuildQueue): boolean {
    if (!stagePaused.delete(guildId)) return false
    if (queue?.node.isPaused()) queue.node.resume()
    return true
}

export const setupStageSpeaker = (client: CustomClient): void => {
    client.on(
        'voiceStateUpdate',
        async (oldState: VoiceState, newState: VoiceState) => {
            if (newState.member?.id !== client.user?.id) return

            const guildId = newState.guild.id
            const queue = client.player.nodes.get(guildId) ?? undefined

            if (newState.channel?.type !== ChannelType.GuildStageVoice) {
                // Moved off the stage (or disconnected) while we were holding
                // playback. Nothing suppresses us here, so let it play.
                if (resumeIfStagePaused(guildId, queue)) {
                    infoLog({
                        message: `Left the stage in ${newState.guild.name} — resuming held playback`,
                    })
                }
                return
            }

            // Our own setRequestToSpeak echoes back as a voiceStateUpdate with
            // the channel and the suppress flag both unchanged. Acting on that
            // echo would ask again, and again, forever.
            const movedChannel = oldState.channelId !== newState.channelId
            const suppressFlipped = oldState.suppress !== newState.suppress
            if (!movedChannel && !suppressFlipped) return

            if (!newState.suppress) {
                if (resumeIfStagePaused(guildId, queue)) {
                    infoLog({
                        message: `Granted speaker on stage in ${newState.guild.name} — resuming`,
                    })
                }
                return
            }

            const outcome = await ensureStageSpeaker(newState)
            infoLog({
                message: `Stage speaker attempt in ${newState.guild.name}: ${outcome}`,
            })

            // Hold playback whenever the bot is not going to be heard, without
            // asking whether a track has started. Gating on isPlaying() missed
            // the join case entirely, because at join time playback has not
            // begun yet and the first track then drained into a muted channel.
            // Recording the pause is what makes it ours to undo: a queue the
            // user paused is never in this set, so approval never resumes it.
            if (outcome !== 'unsuppressed' && queue && !queue.node.isPaused()) {
                queue.node.pause()
                stagePaused.add(guildId)
            }

            await notifyStageOutcome(queue, outcome)
        },
    )
}

export const setupLifecycleHandlers = (player: {
    events: { on: (event: string, handler: Function) => void }
}): void => {
    player.events.on('debug', (queue: GuildQueue, message: string) => {
        debugLog({
            message: `Player debug from ${queue.guild.name}: ${message}`,
        })
    })

    player.events.on('connection', async (queue: GuildQueue) => {
        infoLog({
            message: `Created connection to voice channel in ${queue.guild.name}`,
        })

        if (queue.connection) {
            debugLog({
                message: 'Voice connection details',
                data: {
                    state: queue.connection.state?.status,
                    joinConfig: queue.connection.joinConfig,
                    ready: queue.connection.state?.status === 'ready',
                },
            })
        }

        if (
            ENVIRONMENT_CONFIG.MUSIC.SESSION_RESTORE_ENABLED &&
            !musicWatchdogService.isIntentionalStop(queue.guild.id)
        ) {
            const metadata = queue.metadata as QueueMetadata | undefined
            // Abort the restore if the deadline wins the race, so a slow restore
            // can't keep enqueueing tracks after we've moved on with an empty queue.
            const restoreController = new AbortController()
            const restoreDeadline = new Promise<never>((_, reject) =>
                setTimeout(
                    () =>
                        reject(
                            new Error(
                                `Session restore timed out in ${queue.guild.name}`,
                            ),
                        ),
                    2000,
                ),
            )

            try {
                await Promise.race([
                    musicSessionSnapshotService.restoreSnapshot(
                        queue,
                        metadata?.requestedBy ?? undefined,
                        { signal: restoreController.signal },
                    ),
                    restoreDeadline,
                ])
            } catch (error) {
                // Cancel the still-running restore so it stops before enqueuing more.
                restoreController.abort()
                infoLog({
                    message: `Snapshot restore failed, continuing with empty queue`,
                    data: {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                })
            }
        }

        musicWatchdogService.arm(queue)
    })

    player.events.on('connectionDestroyed', async (queue: GuildQueue) => {
        infoLog({
            message: `Destroyed connection to voice channel in ${queue.guild.name}`,
        })

        await voiceStatus.clearStatus(queue)
        await musicSessionSnapshotService.saveSnapshot(queue)
        // Queue was explicitly deleted — never attempt recovery here.
    })

    player.events.on('emptyChannel', async (queue: GuildQueue) => {
        infoLog({ message: `Channel is empty in ${queue.guild.name}` })
        await voiceStatus.clearStatus(queue)
        await musicSessionSnapshotService.saveSnapshot(queue)
        musicWatchdogService.clear(queue.guild.id)
    })

    player.events.on('emptyQueue', async (queue: GuildQueue) => {
        const isAutoplayEnabled = queue.repeatMode === 3
        const guildId = queue.guild.id
        if (
            isAutoplayEnabled &&
            queue.currentTrack &&
            !musicWatchdogService.isIntentionalStop(guildId) &&
            !isReplenishSuppressed(guildId)
        ) {
            await replenishQueue(queue)
        } else if (!isAutoplayEnabled || !queue.currentTrack) {
            musicWatchdogService.markIntentionalStop(guildId)
        }
        // else: autoplay would apply but is suppressed/intentional-stop —
        // leave the queue empty without forcing markIntentionalStop; the
        // guarded playerFinish/playerSkip path (queueExhaustion.ts) already
        // owns "nothing left to play" cleanup for that case.
    })

    player.events.on('disconnect', async (queue: GuildQueue) => {
        infoLog({
            message: `Disconnected from voice channel in ${queue.guild.name}`,
        })

        await voiceStatus.clearStatus(queue)
        await musicSessionSnapshotService.saveSnapshot(queue)
        if (!musicWatchdogService.isIntentionalStop(queue.guild.id)) {
            await musicWatchdogService.checkAndRecover(queue)
        }
    })
}
