import type { GuildQueue } from 'discord-player'
import type { Client, VoiceState } from 'discord.js'
import { ChannelType, PermissionFlagsBits } from 'discord.js'
import { debugLog, infoLog, warnLog } from '@lucky/shared/utils'
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
    'not-applicable' | 'audible' | 'unmuted' | 'server-muted' | 'no-speak'

/**
 * Two ways the bot plays into a normal voice channel and nobody hears it,
 * with no error anywhere: the channel denies it **Speak**, or a moderator
 * server-muted it. In both, discord-player logs "Started playing" and the
 * queue drains into silence. A new server reported exactly this through the
 * admin feedback prompt on 2026-11-26 ("I was not able to hear the music"),
 * after restarting the same track five times in eleven minutes.
 *
 * A server mute is undone when the bot holds **Mute Members**; nothing else
 * is fixable from here, so the caller tells the channel what to change.
 */
export async function ensureAudible(
    voice: VoiceState,
): Promise<AudibilityOutcome> {
    const channel = voice.channel
    if (!channel || channel.type !== ChannelType.GuildVoice) {
        return 'not-applicable'
    }

    const me = voice.guild.members.me
    if (!me) return 'not-applicable'

    const permissions = me.permissionsIn(channel)
    if (!permissions.has(PermissionFlagsBits.Speak)) return 'no-speak'

    if (!voice.serverMute) return 'audible'

    if (permissions.has(PermissionFlagsBits.MuteMembers)) {
        try {
            await voice.setMute(false)
            return 'unmuted'
        } catch (error) {
            debugLog({
                message: 'Self server-unmute rejected',
                error,
                data: { guildId: voice.guild.id, channelId: channel.id },
            })
        }
    }

    return 'server-muted'
}

const AUDIBILITY_NOTICES: Partial<
    Record<AudibilityOutcome, { title: string; body: string }>
> = {
    'no-speak': {
        title: "🔇 I can't be heard in this channel",
        body: "I joined, but this voice channel doesn't give me the **Speak** permission, so the music plays and nobody hears it. Allow **Speak** for Lucky in the channel settings, then use /play again.",
    },
    'server-muted': {
        title: "🔇 I'm server-muted",
        body: 'A moderator muted me in voice, so nobody can hear the music. Right-click Lucky in the voice channel and turn off **Server Mute**, or give me **Mute Members** so I can undo it myself.',
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

            const outcome = await ensureAudible(newState)
            if (outcome === 'not-applicable' || outcome === 'audible') return

            const guildId = newState.guild.id
            if (outcome === 'unmuted') {
                infoLog({
                    message: `voice: removed own server mute in ${newState.guild.name}`,
                    data: { guildId },
                })
                return
            }

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
