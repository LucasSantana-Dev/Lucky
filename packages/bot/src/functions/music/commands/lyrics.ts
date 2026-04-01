import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { errorEmbed, musicEmbed, warningEmbed } from '../../../utils/general/embeds'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { requireCurrentTrack } from '../../../utils/command/commandValidations'
import { featureToggleService, lyricsService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription(
            '📄 Show the lyrics of the current song or a specified song.',
        )
        .addStringOption((option) =>
            option
                .setName('song')
                .setDescription(
                    'Song name, or "Artist - Title" for best results (optional)',
                ),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const context = {
            userId: interaction.user.id,
            guildId: interaction.guildId ?? undefined,
        }
        const isEnabled = await featureToggleService.isEnabled(
            'LYRICS',
            context,
        )

        if (!isEnabled) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        warningEmbed(
                            'Feature unavailable',
                            'The lyrics feature is currently disabled.',
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        const query = interaction.options.getString('song')
        let title = query
        let artist: string | undefined

        if (title === null || title === '') {
            const guildId = interaction.guildId
            if (!guildId) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            errorEmbed(
                                'Server only',
                                'This command can only be used in a server.',
                            ),
                        ],
                        ephemeral: true,
                    },
                })
                return
            }

            const { queue } = resolveGuildQueue(client, guildId)
            const track = queue?.currentTrack

            if (!(await requireCurrentTrack(queue, interaction))) return

            title = track?.title ?? 'Unknown'
            artist = track?.author
        }

        await interaction.deferReply()

        try {
            const result = await lyricsService.searchLyrics(title, artist)

            if ('error' in result) {
                await interaction.editReply({
                    embeds: [errorEmbed('Lyrics not found', result.message)],
                })
                return
            }

            const pages = lyricsService.splitLyrics(result.lyrics)
            const firstEmbed = musicEmbed(
                `Lyrics — ${result.title}`,
                pages[0],
            ).setFooter({
                text: `Source: ${result.source} • Page 1/${pages.length}`,
            })

            await interaction.editReply({ embeds: [firstEmbed] })

            for (let i = 1; i < pages.length; i++) {
                const pageEmbed = musicEmbed(
                    `Lyrics — ${result.title}`,
                    pages[i],
                ).setFooter({
                    text: `Source: ${result.source} • Page ${i + 1}/${pages.length}`,
                })

                await interaction.followUp({
                    embeds: [pageEmbed],
                    ephemeral: false,
                })
            }
        } catch (error) {
            errorLog({
                message: 'Failed to fetch lyrics',
                error,
                data: {
                    guildId: interaction.guildId ?? undefined,
                    userId: interaction.user.id,
                },
            })
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        'Lyrics error',
                        'An unexpected error occurred while fetching lyrics. Please try again later.',
                    ),
                ],
            })
        }
    },
})
