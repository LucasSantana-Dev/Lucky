import {
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    type ButtonInteraction,
    type GuildMember,
} from 'discord.js'
import type { TFunction } from 'i18next'
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
    const player = client.player

    // Search each top track concurrently, keep first search hit per track.
    const searchResults = await Promise.all(
        recap.topTracks.slice(0, MAX_MIX_TRACKS).map(async (track) => {
            try {
                const result = await player.search(
                    `${track.title} ${track.author}`,
                    { requestedBy: interaction.user },
                )
                return result.hasTracks() ? result.tracks[0] : null
            } catch {
                return null
            }
        }),
    )

    const found = searchResults.filter((t) => t !== null)
    if (found.length === 0) {
        await reply(t('music.recap.mixNoTracks'))
        return
    }

    const nodeOptions = {
        metadata: {
            channel: interaction.channel,
            requestedBy: interaction.user,
            vcMemberIds: [] as string[],
        },
        selfDeaf: true,
        connectionTimeout: ENVIRONMENT_CONFIG.PLAYER.CONNECTION_TIMEOUT,
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 30_000,
        leaveOnEnd: true,
        leaveOnEndCooldown: 300_000,
    }

    try {
        await player.play(voiceChannel, found[0], {
            nodeOptions,
            requestedBy: interaction.user,
        })

        if (found.length > 1) {
            const { queue } = resolveGuildQueue(client, guildId)
            if (queue) {
                for (const track of found.slice(1)) {
                    track.requestedBy = interaction.user
                    queue.addTrack(track)
                }
            }
        }
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
    await reply(t('music.recap.mixQueued', { count: found.length }))
}
