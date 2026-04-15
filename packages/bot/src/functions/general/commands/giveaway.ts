import { COLOR } from '@lucky/shared/constants'
import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders'
import { PermissionFlagsBits, type TextChannel } from 'discord.js'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { requireGuild } from '../../../utils/command/commandValidations'
import { createSuccessEmbed, createErrorEmbed, createInfoEmbed } from '../../../utils/general/embeds'
import { errorLog } from '@lucky/shared/utils'

type GiveawayEntry = {
    messageId: string
    channelId: string
    guildId: string
    prize: string
    winnersCount: number
    endTime: number
    entries: Set<string>
    timeoutId: NodeJS.Timeout
}

const activeGiveaways = new Map<string, GiveawayEntry>()

function parseDuration(durationStr: string): number {
    const regex = /(\d+)([hmd])/g
    let totalMs = 0
    let match

    while ((match = regex.exec(durationStr)) !== null) {
        const value = parseInt(match[1], 10)
        const unit = match[2]

        switch (unit) {
            case 'h':
                totalMs += value * 3600000
                break
            case 'm':
                totalMs += value * 60000
                break
            case 'd':
                totalMs += value * 86400000
                break
        }
    }

    return totalMs
}

async function endGiveaway(messageId: string, isReroll = false, client?: any): Promise<void> {
    const giveaway = activeGiveaways.get(messageId)
    if (!isReroll) {
        clearTimeout(giveaway?.timeoutId)
    }

    if (!giveaway) return

    if (!client) {
        try {
            client = require('../../../client').default
        } catch {
            return
        }
    }

    const guild = client.guilds.cache.get(giveaway.guildId)
    if (!guild) return

    const rawChannel = guild.channels.cache.get(giveaway.channelId)
    if (!rawChannel || !rawChannel.isTextBased()) return

    const channel = rawChannel as TextChannel
    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null)
    if (!message) return

    const entries = Array.from(giveaway.entries)
    if (entries.length === 0) {
        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🎉 Giveaway Ended 🎉')
                    .setDescription(`**${giveaway.prize}** - No valid entries!`)
                    .setColor(COLOR.ERROR_RED),
            ],
        })
        if (!isReroll) activeGiveaways.delete(messageId)
        return
    }

    const winners: string[] = []
    const selectedIndexes = new Set<number>()

    for (let i = 0; i < Math.min(giveaway.winnersCount, entries.length); i++) {
        let index = Math.floor(Math.random() * entries.length)
        while (selectedIndexes.has(index)) {
            index = Math.floor(Math.random() * entries.length)
        }
        selectedIndexes.add(index)
        winners.push(entries[index])
    }

    const winnerMentions = winners.map((id) => `<@${id}>`).join(', ')

    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle(`🎉 Giveaway ${isReroll ? 'Rerolled' : 'Ended'} 🎉`)
                .setDescription(`**${giveaway.prize}**\n\nWinner${giveaway.winnersCount > 1 ? 's' : ''}: ${winnerMentions}`)
                .setColor(COLOR.SUCCESS_GREEN)
                .setFooter({ text: `${giveaway.winnersCount} winner${giveaway.winnersCount > 1 ? 's' : ''}` }),
        ],
    })

    if (!isReroll) activeGiveaways.delete(messageId)
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Run a giveaway')
        .addSubcommand((sub) =>
            sub
                .setName('start')
                .setDescription('Start a giveaway')
                .addStringOption((o) =>
                    o
                        .setName('duration')
                        .setDescription('Duration (e.g., 1h, 30m, 2d, 1h30m)')
                        .setRequired(true),
                )
                .addStringOption((o) =>
                    o
                        .setName('prize')
                        .setDescription('Prize description')
                        .setRequired(true),
                )
                .addIntegerOption((o) =>
                    o
                        .setName('winners')
                        .setDescription('Number of winners (default: 1)')
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('end')
                .setDescription('End a giveaway early')
                .addStringOption((o) =>
                    o
                        .setName('message_id')
                        .setDescription('Message ID of the giveaway')
                        .setRequired(true),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('reroll')
                .setDescription('Pick new winner(s) from existing entries')
                .addStringOption((o) =>
                    o
                        .setName('message_id')
                        .setDescription('Message ID of the giveaway')
                        .setRequired(true),
                ),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    category: 'general',
    execute: async ({ interaction }) => {
        if (!(await requireGuild(interaction))) return
        if (!interaction.guild) return

        const subcommand = interaction.options.getSubcommand()

        try {
            if (subcommand === 'start') {
                const durationStr = interaction.options.getString('duration', true)
                const prize = interaction.options.getString('prize', true)
                const winnersCount = interaction.options.getInteger('winners') ?? 1

                const durationMs = parseDuration(durationStr)
                if (durationMs <= 0) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                createErrorEmbed(
                                    'Invalid Duration',
                                    'Please provide a valid duration (e.g., 1h, 30m, 2d)',
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                    return
                }

                const endTime = Date.now() + durationMs
                const embed = new EmbedBuilder()
                    .setTitle('🎉 GIVEAWAY 🎉')
                    .setDescription(prize)
                    .addFields(
                        { name: 'Winners', value: `${winnersCount}`, inline: true },
                        { name: 'Ends', value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: true },
                    )
                    .setColor(COLOR.WARNING_GOLD)
                    .setFooter({ text: 'React with 🎉 to enter' })

                if (!interaction.channel || !interaction.channel.isTextBased()) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [createErrorEmbed('Error', 'This channel is not text-based.')],
                            ephemeral: true,
                        },
                    })
                    return
                }

                const message = await (interaction.channel as TextChannel).send({ embeds: [embed] })
                if (!message) return

                await message.react('🎉')

                const giveaway: GiveawayEntry = {
                    messageId: message.id,
                    channelId: interaction.channelId,
                    guildId: interaction.guild.id,
                    prize,
                    winnersCount,
                    endTime,
                    entries: new Set(),
                    timeoutId: setTimeout(() => {
                        endGiveaway(message.id)
                    }, durationMs),
                }

                activeGiveaways.set(message.id, giveaway)

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createSuccessEmbed(
                                'Giveaway Started',
                                `Giveaway for **${prize}** has started! React with 🎉 to enter.\n[Jump to giveaway](${message.url})`,
                            ),
                        ],
                    },
                })
            } else if (subcommand === 'end') {
                const messageId = interaction.options.getString('message_id', true)

                const giveaway = activeGiveaways.get(messageId)
                if (!giveaway) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [createErrorEmbed('Not Found', 'Giveaway not found.')],
                            ephemeral: true,
                        },
                    })
                    return
                }

                await endGiveaway(messageId)

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [createSuccessEmbed('Giveaway Ended', 'Winners have been selected.')],
                    },
                })
            } else if (subcommand === 'reroll') {
                const messageId = interaction.options.getString('message_id', true)

                const giveaway = activeGiveaways.get(messageId)
                if (!giveaway) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [createErrorEmbed('Not Found', 'Giveaway not found.')],
                            ephemeral: true,
                        },
                    })
                    return
                }

                await endGiveaway(messageId, true)

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [createSuccessEmbed('Rerolled', 'New winners have been selected.')],
                    },
                })
            }
        } catch (error) {
            errorLog({ message: 'Error in giveaway command:', error })
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Error',
                            error instanceof Error ? error.message : 'An error occurred.',
                        ),
                    ],
                    ephemeral: true,
                },
            })
        }
    },
})

export { activeGiveaways, parseDuration }
