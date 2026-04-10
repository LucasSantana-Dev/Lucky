import { QueryType } from 'discord-player'
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js'
import type { CustomClient } from '../../../../types'
import {
    requireVoiceChannel,
    requireDJRole,
} from '../../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../../utils/music/queueResolver'
import { buildPlayResponseEmbed } from '../../../../utils/music/nowPlayingEmbed'
import { createMusicControlButtons } from '../../../../utils/music/buttonComponents'
import { createErrorEmbed } from '../../../../utils/general/embeds'
import { interactionReply } from '../../../../utils/general/interactionReply'
import { createUserFriendlyError } from '../../../../utils/general/errorSanitizer'
import { errorLog, debugLog, warnLog } from '@lucky/shared/utils'

export const DISCORD_UNKNOWN_INTERACTION_CODE = 10062

export function isUnknownInteractionError(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: number }).code === DISCORD_UNKNOWN_INTERACTION_CODE
    )
}

export function isUrl(query: string): boolean {
    return query.startsWith('http://') || query.startsWith('https://')
}

/**
 * Strips SoundCloud playlist-context query params (`?in=...`) that the
 * SoundCloud extractor cannot resolve. The bare track URL resolves correctly.
 */
export function normalizeSoundCloudUrl(url: string): string {
    if (!url.includes('soundcloud.com')) return url
    try {
        const parsed = new URL(url)
        parsed.searchParams.delete('in')
        return parsed.toString()
    } catch {
        return url
    }
}

export function resolveSearchEngine(
    query: string,
    provider?: string | null,
): QueryType {
    if (isUrl(query)) return QueryType.AUTO

    switch (provider) {
        case 'youtube':
            return QueryType.YOUTUBE_SEARCH
        case 'soundcloud':
            return QueryType.SOUNDCLOUD_SEARCH
        case 'spotify':
            return QueryType.SPOTIFY_SEARCH
        default:
            return QueryType.AUTO_SEARCH
    }
}

type PlayAtTopOptions = {
    client: CustomClient
    interaction: ChatInputCommandInteraction
    skipCurrent: boolean
    commandName: string
}

export async function executePlayAtTop({
    client,
    interaction,
    skipCurrent,
    commandName,
}: PlayAtTopOptions): Promise<void> {
    if (!interaction.guildId) {
        await interaction.reply({
            embeds: [
                createErrorEmbed(
                    'Error',
                    'This command can only be used in a server',
                ),
            ],
            ephemeral: true,
        })
        return
    }

    const member = interaction.member as GuildMember
    if (!(await requireVoiceChannel(interaction))) return
    if (!(await requireDJRole(interaction, interaction.guildId))) return

    const voiceChannel = member.voice.channel!

    try {
        await interaction.deferReply()
    } catch (error) {
        if (isUnknownInteractionError(error)) return
        throw error
    }

    const query = interaction.options.getString('query', true)

    try {
        const searchEngine = resolveSearchEngine(query)
        const result = await client.player.play(voiceChannel, query, {
            searchEngine,
        })
        const track = result.track

        const { queue } = resolveGuildQueue(client, interaction.guildId)
        if (!queue) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed('Error', 'Could not create queue'),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        const tracks = queue.tracks.toArray()
        if (tracks.length > 0) {
            queue.node.remove(track)
            queue.insertTrack(track, 0)
            if (skipCurrent) queue.node.skip()
        }

        const embed = buildPlayResponseEmbed(
            skipCurrent
                ? { kind: 'nowPlaying', track, requestedBy: interaction.user }
                : {
                      kind: 'addedToQueue',
                      track,
                      requestedBy: interaction.user,
                      queuePosition: 1,
                  },
        )

        await interactionReply({
            interaction,
            content: {
                embeds: [embed],
                components: [createMusicControlButtons(queue)],
            },
        })

        debugLog({
            message: skipCurrent
                ? 'track added to top and current skipped'
                : 'track added to top of queue',
            data: { query, guildId: interaction.guildId },
        })
    } catch (error) {
        if (isUnknownInteractionError(error)) {
            debugLog({
                message: `${commandName} interaction expired before reply`,
                data: { query, guildId: interaction.guildId },
            })
            return
        }

        errorLog({
            message: `${commandName} error:`,
            error,
            data: { query, guildId: interaction.guildId },
        })

        try {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Play Error',
                            createUserFriendlyError(error),
                        ),
                    ],
                    ephemeral: true,
                },
            })
        } catch (replyError) {
            warnLog({
                message: `failed to send ${commandName} error reply`,
                error: replyError,
                data: { guildId: interaction.guildId },
            })
        }
    }
}
