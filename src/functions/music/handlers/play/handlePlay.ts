import type { Track } from "discord-player"
import type { ChatInputCommandInteraction, EmbedBuilder } from "discord.js"
import { errorLog } from "../../../../utils/general/log"
import { searchContentOnYoutube } from "../../../../utils/search/searchContentOnYoutube"
import type { ICustomClient } from "../../../../types"
import { messages } from "../../../../utils/general/messages"
import { interactionReply } from "../../../../utils/general/interactionReply"
import { createUserFriendlyError } from "../../../../utils/general/errorSanitizer"

interface IQueue {
    addTrack: (_track: Track<unknown>) => void
}

// interface ISearchResult {
//     tracks: ISearchTrack[]
// }

export const handlePlay = async ({
    client,
    interaction,
    queue,
    embed,
}: {
    client: ICustomClient
    interaction: ChatInputCommandInteraction
    queue: IQueue
    embed: EmbedBuilder
}) => {
    const query = interaction.options.getString("query")

    errorLog({ message: `Query: ${query}` })

    if (!query) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    embed
                        .setColor("Red")
                        .setDescription(messages.error.noQuery),
                ],
            },
        })
        return
    }

    try {
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
                            .setColor("Red")
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
            .setColor("Green")
            .setDescription(`✅ Added to queue: **${track.title}**`)
            .setThumbnail(track.thumbnail)

        await interactionReply({
            interaction,
            content: { embeds: [embed] },
        })
    } catch (error) {
        errorLog({ message: `Error in handlePlay: ${error}` })
        const userFriendlyError = createUserFriendlyError(error)
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    embed.setColor("Red").setDescription(userFriendlyError),
                ],
            },
        })
    }
}
