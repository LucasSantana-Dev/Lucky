import type { GuildQueue } from 'discord-player'
import type { Client, VoiceState } from 'discord.js'
import { ChannelType, PermissionFlagsBits } from 'discord.js'
import { debugLog, warnLog } from '@lucky/shared/utils'
import { createWarningEmbed } from '../../utils/general/embeds'
import type { CustomClient } from '../../types'
import type { QueueMetadata } from '../../types/QueueMetadata'

/**
 * Whether the bot can be heard in the normal voice channel it is in.
 *
 * `not-applicable` covers stage channels (setupStageSpeaker owns those, where
 * the silent failure is the audience suppress flag) and states with no
 * channel or no cached bot member.
 */
export type AudibilityOutcome =
    | 'not-applicable'
    | 'audible'
    | 'server-muted'
    | 'no-speak'
    | 'no-speak-muted'

/**
 * Two ways the bot plays into a normal voice channel and nobody hears it,
 * with no error anywhere: the channel denies it **Speak**, or a moderator
 * server-muted it. In both, discord-player logs "Started playing" and the
 * queue drains into silence. A new server reported exactly this through the
 * admin feedback prompt on 2026-11-26 ("I was not able to hear the music"),
 * after restarting the same track five times in eleven minutes.
 *
 * Neither is changed from here. A server mute is a moderator's decision, so
 * the bot never lifts it even when it holds **Mute Members**; the caller
 * tells the channel what to change instead.
 */
export function ensureAudible(voice: VoiceState): AudibilityOutcome {
    const channel = voice.channel
    if (!channel || channel.type !== ChannelType.GuildVoice) {
        return 'not-applicable'
    }

    const me = voice.guild.members.me
    if (!me) return 'not-applicable'

    const muted = voice.serverMute === true
    if (!me.permissionsIn(channel).has(PermissionFlagsBits.Speak)) {
        return muted ? 'no-speak-muted' : 'no-speak'
    }
    return muted ? 'server-muted' : 'audible'
}

const UNMUTE_BY_HAND =
    'Right-click Lucky in the voice channel and turn off **Server Mute**'

const AUDIBILITY_NOTICES: Partial<
    Record<AudibilityOutcome, { title: string; body: string }>
> = {
    'no-speak': {
        title: "🔇 I can't be heard in this channel",
        body: "I joined, but this voice channel doesn't give me the **Speak** permission, so the music plays and nobody hears it. Allow **Speak** for Lucky in the channel settings, then use /play again.",
    },
    'no-speak-muted': {
        title: "🔇 I can't be heard in this channel",
        body: `This voice channel doesn't give me the **Speak** permission, and a moderator also server-muted me. Allow **Speak** for Lucky in the channel settings. ${UNMUTE_BY_HAND}. Then use /play again.`,
    },
    'server-muted': {
        title: "🔇 I'm server-muted",
        body: `A moderator muted me in voice, so nobody can hear the music. ${UNMUTE_BY_HAND} if you want the music back.`,
    },
}

async function notifyAudibilityOutcome(
    queue: GuildQueue | undefined,
    outcome: AudibilityOutcome,
): Promise<void> {
    const notice = AUDIBILITY_NOTICES[outcome]
    if (!notice) return

    const channel = (queue?.metadata as QueueMetadata | undefined)?.channel
    if (!channel) return

    try {
        await channel.send({
            embeds: [createWarningEmbed(notice.title, notice.body)],
        })
    } catch (error) {
        debugLog({
            message: 'Failed to notify channel about audibility outcome',
            error,
            data: { guildId: queue?.guild.id, outcome },
        })
    }
}

/**
 * Checks audibility when the bot joins or moves into a voice channel, and
 * again whenever its server mute is switched on mid-session. The voice state
 * here is fresh by construction, the same reason setupStageSpeaker listens on
 * `voiceStateUpdate` rather than the player's `connection` event.
 */
export const setupVoiceAudibilityCheck = (client: Client): void => {
    client.on(
        'voiceStateUpdate',
        async (oldState: VoiceState, newState: VoiceState) => {
            if (newState.member?.id !== client.user?.id) return
            if (!newState.channelId) return

            const movedChannel = oldState.channelId !== newState.channelId
            const mutedNow = !oldState.serverMute && newState.serverMute
            if (!movedChannel && !mutedNow) return

            const outcome = ensureAudible(newState)
            if (outcome === 'not-applicable' || outcome === 'audible') return

            const guildId = newState.guild.id
            warnLog({
                message: `voice: bot cannot be heard (${outcome})`,
                data: { guildId, channelId: newState.channelId },
            })
            const queue =
                (client as CustomClient).player?.nodes.get(guildId) ?? undefined
            await notifyAudibilityOutcome(queue, outcome)
        },
    )
}
