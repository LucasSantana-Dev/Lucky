import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { createErrorEmbed, musicEmbed, createWarningEmbed } from '../../../utils/general/embeds'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { requireGuild } from '../../../utils/command/commandValidations'
import { trackHistoryService } from '@lucky/shared/services'

const PAGE_SIZE = 10

export default new Command({
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription('📜 Show the recently played tracks in this server.')
        .addIntegerOption((option) =>
            option
                .setName('page')
                .setDescription('Page number (default: 1)')
                .setMinValue(1),
        ),
    category: 'music',
    execute: async ({ interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return

        const guildId = interaction.guildId!
        const page = (interaction.options.getInteger('page') ?? 1)

        await interaction.deferReply()

        const limit = PAGE_SIZE * page
        const allEntries = await trackHistoryService.getTrackHistory(guildId, limit)

        if (allEntries.length === 0) {
            await interaction.editReply({
                embeds: [createWarningEmbed('No history', 'No tracks have been played in this server yet.')],
            })
            return
        }

        const totalFetched = allEntries.length
        const start = (page - 1) * PAGE_SIZE
        const pageEntries = allEntries.slice(start, start + PAGE_SIZE)

        if (pageEntries.length === 0) {
            await interaction.editReply({
                embeds: [createErrorEmbed('Page not found', `There are only ${Math.ceil(totalFetched / PAGE_SIZE)} page(s) of history.`)],
            })
            return
        }

        const lines = pageEntries.map((entry, i) => {
            const index = start + i + 1
            const timestampSec = Math.floor(entry.timestamp / 1000)
            const tag = entry.isAutoplay ? ' 🤖' : ''
            return `**${index}.** ${entry.title} — ${entry.author} \`${entry.duration}\`${tag} · <t:${timestampSec}:R>`
        })

        const hasMore = totalFetched === limit
        const footerText = hasMore
            ? `Page ${page} · use /history page:${page + 1} for more`
            : `Page ${page} · ${totalFetched} track${totalFetched !== 1 ? 's' : ''} in history`

        const embed = musicEmbed('Recently Played', lines.join('\n')).setFooter({
            text: footerText,
        })

        await interaction.editReply({ embeds: [embed] })
    },
})
