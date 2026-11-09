import {
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    type ButtonInteraction,
    type GuildMember,
    type VoiceBasedChannel,
} from 'discord.js'
import type { TFunction } from 'i18next'
import type { Track } from 'discord-player'
import { errorLog } from '@lucky/shared/utils'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { getWeeklyRecap } from '@lucky/shared/services'
import { translatorForInteraction } from '../../i18n/translatorForInteraction'
import {
    latestRecapBoundary,
    recapWindow,
} from '../../services/recap/recapWindow'
import { resolveGuildQueue } from '../../services/musicManagement/queueResolver'
import { recapMixPlayedTotal } from '../../utils/monitoring/prometheus'
import type { CustomClient } from '../../types'

export const RECAP_MIX_BUTTON_ID = 'recap_mix'

const MAX_MIX_TRACKS = 5

export function buildRecapMixButton(t: TFunction): ButtonBuilder {
    return new ButtonBuilder()
        .setCustomId(RECAP_MIX_BUTTON_ID)
        .setLabel(t('music.recap.mixButton'))
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Primary)
}

export async function handleRecapMixButton(
    interaction: ButtonInteraction,
): Promise<void> {
    const guildId = interaction.guildId
    if (!guildId) return

    await interaction.deferUpdate()

    const t = await translatorForInteraction(interaction)
    const reply = (content: string) =>
        interaction.followUp({ content, flags: MessageFlags.Ephemeral })

    const member = interaction.member as GuildMember
    const voiceChannel = member.voice?.channel
    if (!voiceChannel) {
        await reply(t('music.recap.mixNoVoice'))
        return
    }

    const boundary = latestRecapBoundary(new Date())
    const { from, to } = recapWindow(boundary)
    const recap = await getWeeklyRecap(guildId, from, to)

    if (recap.topTracks.length === 0) {
        await reply(t('music.recap.mixNoTracks'))
        return
    }

    const client = interaction.client as unknown as CustomClient
    const found = await findMixTracks(client, interaction, recap.topTracks)
    if (found.length === 0) {
        await reply(t('music.recap.mixNoTracks'))
        return
    }

    let queued: number
    try {
        queued = await playMix(client, interaction, voiceChannel, found)
    } catch (error) {
        errorLog({
            message: 'recap mix button: play failed',
            error,
            data: { guildId },
        })
        await reply(t('music.recap.mixFailed'))
        return
    }

    recapMixPlayedTotal.inc()
    await reply(t('music.recap.mixQueued', { count: queued }))
}

// Search each top track concurrently, keep first search hit per track.
async function findMixTracks(
    client: CustomClient,
    interaction: ButtonInteraction,
    topTracks: { title: string; author: string }[],
): Promise<Track[]> {
    const results = await Promise.all(
        topTracks.slice(0, MAX_MIX_TRACKS).map(async (track) => {
            try {
                const result = await client.player.search(
                    `${track.title} ${track.author}`,
                    { requestedBy: interaction.user },
                )
                return result.hasTracks() ? result.tracks[0] : null
            } catch {
                return null
            }
        }),
    )
    return results.filter((track): track is Track => track !== null)
}

// Plays the first track, queues the rest, returns how many tracks were
// actually accepted (a missing queue means only the first one is playing).
async function playMix(
    client: CustomClient,
    interaction: ButtonInteraction,
    voiceChannel: VoiceBasedChannel,
    found: Track[],
): Promise<number> {
    const guildId = interaction.guildId as string
    const vcMemberIds = Array.from(voiceChannel.members.values())
        .filter((m) => !m.user.bot)
        .map((m) => m.id)

    await client.player.play(voiceChannel, found[0], {
        nodeOptions: {
            metadata: {
                channel: interaction.channel,
                requestedBy: interaction.user,
                vcMemberIds,
            },
            selfDeaf: true,
            connectionTimeout: ENVIRONMENT_CONFIG.PLAYER.CONNECTION_TIMEOUT,
            leaveOnEmpty: true,
            leaveOnEmptyCooldown: 30_000,
            leaveOnEnd: true,
            leaveOnEndCooldown: 300_000,
        },
        requestedBy: interaction.user,
    })

    if (found.length === 1) return 1

    const { queue } = resolveGuildQueue(client, guildId)
    if (!queue) {
        errorLog({
            message: 'recap mix button: queue not found, extra tracks dropped',
            error: new Error('queue missing after play'),
            data: { guildId, dropped: found.length - 1 },
        })
        return 1
    }
    for (const track of found.slice(1)) {
        track.requestedBy = interaction.user
        queue.addTrack(track)
    }
    return found.length
}
