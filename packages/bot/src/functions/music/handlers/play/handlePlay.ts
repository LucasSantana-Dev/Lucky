import type { Track } from 'discord-player'
import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js'
import { errorLog } from '@lukbot/shared/utils'
import { searchContentOnYoutube } from '../../../../utils/music/search/searchContentOnYoutube'
import type { CustomClient } from '../../../../types'
import { messages } from '../../../../utils/general/messages'
import { interactionReply } from '../../../../utils/general/interactionReply'
import { createUserFriendlyError } from '../../../../utils/general/errorSanitizer'

// interface ISearchResult {
//     tracks: ISearchTrack[]
// }

async function validateQuery(
    query: string | null,
    interaction: ChatInputCommandInteraction,
    embed: EmbedBuilder,
): Promise<boolean> {
    if (query === null || query === undefined || query === '') {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    embed
                        .setColor('Red')
                        .setDescription(messages.error.noQuery),
                ],
            },
        })
        return false
    }
    return true
}

type SearchAndAddTrackOptions = {
    client: CustomClient
    query: string
    interaction: ChatInputCommandInteraction
    queue: { addTrack: (track: Track) => void }
    embed: EmbedBuilder
}

async function searchAndAddTrack(
    options: SearchAndAddTrackOptions,
): Promise<void> {
    const { client, query, interaction, queue, embed } = options
    const searchResult = await searchContentOnYoutube({
        client,
        searchTerms: query,
        interaction,
    })

    if (!searchResult?.tracks || searchResult.tracks.length === 0) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    embed
                        .setColor('Red')
                        .setDescription(messages.error.noResult),
                ],
            },
        })
        return
    }

    const track = searchResult.tracks[0]
    queue.addTrack({
        title: track.title,
        url: track.url,
        thumbnail: track.thumbnail,
        duration: track.duration,
    } as Track)

    embed
        .setColor('Green')
        .setDescription(`✅ Added to queue: **${track.title}**`)
        .setThumbnail(track.thumbnail)

    await interactionReply({
        interaction,
        content: { embeds: [embed] },
    })
}

async function handlePlayError(
    error: unknown,
    interaction: ChatInputCommandInteraction,
    embed: EmbedBuilder,
): Promise<void> {
    errorLog({ message: `Error in handlePlay: ${error}` })
    const userFriendlyError = createUserFriendlyError(error)
    await interactionReply({
        interaction,
        content: {
            embeds: [embed.setColor('Red').setDescription(userFriendlyError)],
        },
    })
}

export const handlePlay = async ({
    client,
    interaction,
    queue,
    embed,
}: {
    client: CustomClient
    interaction: ChatInputCommandInteraction
    queue: { addTrack: (track: Track) => void }
    embed: EmbedBuilder
}) => {
    const query = interaction.options.getString('query')

    errorLog({ message: `Query: ${query}` })

    if (!(await validateQuery(query, interaction, embed))) {
        return
    }

    try {
        await searchAndAddTrack({
            client,
            query: query ?? '',
            interaction,
            queue,
            embed,
        })
    } catch (error) {
        await handlePlayError(error, interaction, embed)
    }
}
