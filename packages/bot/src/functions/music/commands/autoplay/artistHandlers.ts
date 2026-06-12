import { ChatInputCommandInteraction, ColorResolvable } from 'discord.js'
import { recommendationFeedbackService } from '../../../../services/musicRecommendation/feedbackService'
import {
    createEmbed,
    createErrorEmbed,
    EMBED_COLORS,
    EMOJIS,
} from '../../../../utils/general/embeds'
import { errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../../utils/general/interactionReply'

export async function handleAutoplayArtist(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    const userId = interaction.user.id
    const guildId = interaction.guildId
    if (!guildId) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Guild Not Found',
                        'Unable to retrieve guild information.',
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    const subcommandName = interaction.options.getSubcommand()
    const artistName = interaction.options.getString('artist')

    try {
        switch (subcommandName) {
            case 'prefer': {
                if (!artistName) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                createErrorEmbed(
                                    'Missing Input',
                                    'Please provide an artist name.',
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                    return
                }

                await recommendationFeedbackService.setArtistFeedback(
                    guildId,
                    userId,
                    artistName,
                    'prefer',
                )

                const preferEmbed = createEmbed({
                    title: '⭐ Artist Preferred',
                    description: `**${artistName}** will be prioritized in autoplay recommendations.`,
                    color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                    emoji: EMOJIS.AUTOPLAY,
                    timestamp: true,
                })

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [preferEmbed],
                        ephemeral: true,
                    },
                })
                break
            }

            case 'block': {
                if (!artistName) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                createErrorEmbed(
                                    'Missing Input',
                                    'Please provide an artist name.',
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                    return
                }

                await recommendationFeedbackService.setArtistFeedback(
                    guildId,
                    userId,
                    artistName,
                    'block',
                )

                const blockEmbed = createEmbed({
                    title: '🚫 Artist Blocked',
                    description: `**${artistName}** will not appear in autoplay recommendations.`,
                    color: EMBED_COLORS.ERROR as ColorResolvable,
                    emoji: EMOJIS.AUTOPLAY,
                    timestamp: true,
                })

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [blockEmbed],
                        ephemeral: true,
                    },
                })
                break
            }

            case 'remove': {
                if (!artistName) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                createErrorEmbed(
                                    'Missing Input',
                                    'Please provide an artist name.',
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                    return
                }

                await recommendationFeedbackService.removeArtistFeedback(
                    guildId,
                    userId,
                    artistName,
                )

                const removeEmbed = createEmbed({
                    title: '✓ Preference Removed',
                    description: `**${artistName}** preference has been removed.`,
                    color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                    emoji: EMOJIS.AUTOPLAY,
                    timestamp: true,
                })

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [removeEmbed],
                        ephemeral: true,
                    },
                })
                break
            }

            case 'list': {
                const summary =
                    await recommendationFeedbackService.getArtistFeedbackSummary(
                        guildId,
                        userId,
                    )

                const preferredText =
                    summary.preferred.length > 0
                        ? summary.preferred
                              .map((a: string) => `⭐ ${a}`)
                              .join('\n')
                        : 'No preferred artists.'

                const blockedText =
                    summary.blocked.length > 0
                        ? summary.blocked
                              .map((a: string) => `🚫 ${a}`)
                              .join('\n')
                        : 'No blocked artists.'

                const listEmbed = createEmbed({
                    title: '🎯 Your Artist Preferences',
                    description: `**Preferred:** (${summary.preferred.length})\n${preferredText}\n\n**Blocked:** (${summary.blocked.length})\n${blockedText}`,
                    color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                    emoji: EMOJIS.AUTOPLAY,
                    timestamp: true,
                })

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [listEmbed],
                        ephemeral: true,
                    },
                })
                break
            }

            default:
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'Unknown Subcommand',
                                'This subcommand is not recognized.',
                            ),
                        ],
                        ephemeral: true,
                    },
                })
        }
    } catch (error) {
        errorLog({
            message: 'Failed to handle artist preference',
            error,
            data: { guildId, userId, subcommandName },
        })
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Error',
                        'Failed to update artist preferences.',
                    ),
                ],
                ephemeral: true,
            },
        })
    }
}
