import type { VoiceState } from 'discord.js'
import { ChannelType, PermissionFlagsBits } from 'discord.js'
import { debugLog, warnLog } from '@lucky/shared/utils'

/**
 * What happened when we tried to get the bot onto the stage as a speaker.
 *
 * `requested` is not a failure: the bot is on the stage but silent until a
 * moderator approves it, so callers should pause playback rather than burn
 * through the queue into a muted channel.
 */
export type StageSpeakerOutcome =
    | 'not-stage'
    | 'already-speaking'
    | 'unsuppressed'
    | 'requested'
    | 'blocked'
    | 'failed'

/**
 * Take the mic on a stage channel, or ask for it.
 *
 * A bot joining a `GuildStageVoice` channel lands in the audience, suppressed.
 * `queue.connect()` resolves fine and audio flows, but nobody hears it and
 * nothing is logged — the failure is entirely silent. This is the one place
 * that undoes it.
 *
 * Two ways up, in order of how little they ask of the server:
 *   - `MuteMembers` lets the bot unsuppress itself, no human involved.
 *   - `RequestToSpeak` raises a hand for a moderator to approve. Stage channels
 *     grant this to `@everyone` by default, so this is the path that works on
 *     servers that invited the bot before stage support existed.
 */
export async function ensureStageSpeaker(
    voice: VoiceState,
): Promise<StageSpeakerOutcome> {
    const channel = voice.channel
    if (channel?.type !== ChannelType.GuildStageVoice) return 'not-stage'
    if (!voice.suppress) return 'already-speaking'

    const me = voice.guild.members.me
    if (!me) return 'failed'

    const permissions = me.permissionsIn(channel)

    // Cached permissions can lag the gateway, so a `has()` that says yes is a
    // reason to try, never a guarantee — a rejected unsuppress still falls
    // through to the request path instead of giving up.
    if (permissions.has(PermissionFlagsBits.MuteMembers)) {
        try {
            await voice.setSuppressed(false)
            return 'unsuppressed'
        } catch (error) {
            debugLog({
                message: 'Stage unsuppress rejected, falling back to request',
                error,
                data: { guildId: voice.guild.id, channelId: channel.id },
            })
        }
    }

    if (permissions.has(PermissionFlagsBits.RequestToSpeak)) {
        try {
            await voice.setRequestToSpeak(true)
            return 'requested'
        } catch (error) {
            warnLog({
                message: 'Stage request-to-speak failed',
                data: {
                    guildId: voice.guild.id,
                    channelId: channel.id,
                    error:
                        error instanceof Error ? error.message : String(error),
                },
            })
            return 'failed'
        }
    }

    return 'blocked'
}
