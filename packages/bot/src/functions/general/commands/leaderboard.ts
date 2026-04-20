import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders'
import { COLOR } from '@lucky/shared/constants'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { trackHistoryService } from '@lucky/shared/services'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'

const MAX_LIMIT = 10
const DEFAULT_LIMIT = 10

function ordinal(n: number): string {
    if (n === 1) return '🥇'
    if (n === 2) return '🥈'
    if (n === 3) return '🥉'
    return `\`${String(n).padStart(2, ' ')}\``
}

function truncate(s: string, max: number): string {
    if (s.length <= max) return s
    return s.slice(0, max - 1) + '…'
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription(
            '🏆 Show this server’s top tracks or top artists by plays.',
        )
        .addSubcommand((sub) =>
            sub
                .setName('tracks')
                .setDescription('Top tracks by play count')
                .addIntegerOption((opt) =>
                    opt
                        .setName('limit')
                        .setDescription(`How many to show (1-${MAX_LIMIT})`)
                        .setMinValue(1)
                        .setMaxValue(MAX_LIMIT),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('artists')
                .setDescription('Top artists by play count')
                .addIntegerOption((opt) =>
                    opt
                        .setName('limit')
                        .setDescription(`How many to show (1-${MAX_LIMIT})`)
                        .setMinValue(1)
                        .setMaxValue(MAX_LIMIT),
                ),
        ),
    category: 'general',
    execute: async ({ interaction }) => {
        const guild = interaction.guild
        if (!guild) {
            await interactionReply({
                interaction,
                content: {
                    content: '❌ This command can only be used in a server.',
                },
            })
            return
        }

        const subcommand = interaction.options.getSubcommand()
        const limit = Math.max(
            1,
            Math.min(
                MAX_LIMIT,
                interaction.options.getInteger('limit') ?? DEFAULT_LIMIT,
            ),
        )

        infoLog({
            message: `leaderboard.${subcommand} (limit=${limit}) in guild ${guild.id}`,
        })

        try {
            if (subcommand === 'tracks') {
                const rows = await trackHistoryService.getTopTracks(
                    guild.id,
                    limit,
                )
                if (!rows.length) {
                    await interactionReply({
                        interaction,
                        content: {
                            content:
                                'No track history yet. Play some music and this leaderboard will populate.',
                        },
                    })
                    return
                }
                const lines = rows.map(
                    (row, i) =>
                        `${ordinal(i + 1)} **${truncate(row.title, 64)}** — ${row.plays} play${row.plays === 1 ? '' : 's'}`,
                )
                const embed = new EmbedBuilder()
                    .setTitle('🏆 Top Tracks')
                    .setDescription(lines.join('\n'))
                    .setColor(COLOR.LUCKY_PURPLE)
                    .setFooter({ text: `Top ${rows.length} · ${guild.name}` })
                await interactionReply({
                    interaction,
                    content: { embeds: [embed.toJSON()] },
                })
                return
            }

            if (subcommand === 'artists') {
                const rows = await trackHistoryService.getTopArtists(
                    guild.id,
                    limit,
                )
                if (!rows.length) {
                    await interactionReply({
                        interaction,
                        content: {
                            content:
                                'No track history yet. Play some music and this leaderboard will populate.',
                        },
                    })
                    return
                }
                const lines = rows.map(
                    (row, i) =>
                        `${ordinal(i + 1)} **${truncate(row.artist, 64)}** — ${row.plays} play${row.plays === 1 ? '' : 's'}`,
                )
                const embed = new EmbedBuilder()
                    .setTitle('🎤 Top Artists')
                    .setDescription(lines.join('\n'))
                    .setColor(COLOR.LUCKY_PURPLE)
                    .setFooter({ text: `Top ${rows.length} · ${guild.name}` })
                await interactionReply({
                    interaction,
                    content: { embeds: [embed.toJSON()] },
                })
                return
            }

            await interactionReply({
                interaction,
                content: { content: `❌ Unknown subcommand: ${subcommand}` },
            })
        } catch (error) {
            errorLog({ message: 'leaderboard failed', error: error as Error })
            await interactionReply({
                interaction,
                content: {
                    content: '❌ Failed to load the leaderboard. Try again.',
                },
            })
        }
    },
})
