import { COLOR } from '@lucky/shared/constants'
import { EmbedBuilder } from 'discord.js'

export type ListItem = {
    name: string
    value: string
    inline?: boolean
}

export type ListPageConfig = {
    title: string
    color?: number
    emptyMessage?: string
    itemsPerPage?: number
}

const DEFAULT_COLOR = COLOR.DISCORD_BLURPLE
const DEFAULT_ITEMS_PER_PAGE = 10

export function buildListPageEmbed(
    items: ListItem[],
    page: number,
    config: ListPageConfig,
): EmbedBuilder {
    const itemsPerPage = config.itemsPerPage ?? DEFAULT_ITEMS_PER_PAGE
    const totalPages = items.length === 0 ? 1 : Math.ceil(items.length / itemsPerPage)

    const embed = new EmbedBuilder()
        .setTitle(config.title)
        .setColor(config.color ?? DEFAULT_COLOR)
        .setTimestamp()
        .setFooter({
            text: `Page ${page} / ${totalPages}`,
        })

    if (items.length === 0) {
        embed.setDescription(config.emptyMessage ?? 'No items to display.')
        return embed
    }

    const startIndex = (page - 1) * itemsPerPage
    const endIndex = Math.min(startIndex + itemsPerPage, items.length)
    const pageItems = items.slice(startIndex, endIndex)

    const fields = pageItems.map((item) => ({
        name: item.name,
        value: item.value,
        inline: item.inline ?? false,
    }))

    embed.addFields(fields)
    return embed
}
