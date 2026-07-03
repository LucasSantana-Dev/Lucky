import { SlashCommandBuilder } from '@discordjs/builders'
import {
    PermissionFlagsBits,
    EmbedBuilder,
    type ChatInputCommandInteraction,
    ChannelType,
    type TextChannel,
} from 'discord.js'
import Command from '../../../models/Command'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { giveawayService, parseDuration } from '@lucky/shared/services'
import { getPrismaClient } from '@lucky/shared/utils/database/prismaClient'
import { interactionReply } from '../../../utils/general/interactionReply'
import { COLOR } from '@lucky/shared/constants'

const prisma = getPrismaClient()

/** Helper: Build a giveaway embed showing winners and prize. */
function buildGiveawayEmbed(
    prize: string,
    winners: string[],
    status: 'Ended' | 'Rerolled' = 'Ended',
): EmbedBuilder {
    const statusColor = status === 'Rerolled' ? 0xff9900 : 0xff0000
    const winnersText =
        winners.length > 0 ? winners.map((id) => `<@${id}>`).join(', ') : 'no valid entries'
    const fieldName = status === 'Rerolled' ? 'New Winners' : 'Winners'

    return new EmbedBuilder()
        .setColor(statusColor)
        .setDescription(`**Prize:** ${prize} (${status})`)
        .addFields([
            {
                name: fieldName,
                value: winnersText,
                inline: false,
            },
        ])
}

/** Helper: Post the congratulations or no-entries message. */
async function announceWinners(
    textChannel: TextChannel,
    prize: string,
    winners: string[],
): Promise<void> {
    if (winners.length > 0) {
        await textChannel.send({
            content: `🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(', ')} on winning ${prize}!`,
            allowedMentions: { users: winners },
        })
    } else {
        await textChannel.send({
            content: '❌ No valid entries for this giveaway.',
        })
    }
}

async function handleStart(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    if (!interaction.guildId || !interaction.channelId) {
        await interactionReply({
            interaction,
            content: { content: '❌ Guild or channel context missing.', ephemeral: true },
        })
        return
    }

    const prize = interaction.options.getString('premio', true)
    const duracao = interaction.options.getString('duracao', true)
    const winnersCount = interaction.options.getInteger('vencedores') ?? 1

    const durationMs = parseDuration(duracao)
    if (!durationMs || durationMs > 14 * 24 * 60 * 60 * 1000) {
        await interactionReply({
            interaction,
            content: {
                content:
                    '❌ Invalid duration. Use format: 10m, 2h, 1d (max 14d).',
                ephemeral: true,
            },
        })
        return
    }

    const endsAt = new Date(Date.now() + durationMs)

    // Verify channel is text-based and bot has SendMessages permission
    const channel = interaction.client.channels.cache.get(
        interaction.channelId,
    ) as TextChannel
    if (!channel || channel.type !== ChannelType.GuildText) {
        await interactionReply({
            interaction,
            content: { content: '❌ Cannot access text channel.', ephemeral: true },
        })
        return
    }

    const guild = interaction.guild
    if (!guild) {
        await interactionReply({
            interaction,
            content: { content: '❌ Guild context missing.', ephemeral: true },
        })
        return
    }

    const me = guild.members.me ?? (await guild.members.fetchMe())
    const hasPermission = channel
        .permissionsFor(me)
        ?.has(PermissionFlagsBits.SendMessages)
    if (!hasPermission) {
        await interactionReply({
            interaction,
            content: {
                content:
                    '❌ I do not have permission to send messages in that channel.',
                ephemeral: true,
            },
        })
        return
    }

    // Create giveaway record
    const giveaway = await giveawayService.create({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        prize,
        winnersCount,
        endsAt,
        createdBy: interaction.user.id,
    })

    const embed = new EmbedBuilder()
        .setTitle('🎉 Giveaway')
        .setColor(COLOR.INFO_GREEN)
        .setDescription(`**Prize:** ${prize}`)
        .addFields([
            { name: 'Winners', value: winnersCount.toString(), inline: true },
            {
                name: 'Ends at',
                value: `<t:${Math.floor(endsAt.getTime() / 1000)}:F>`,
                inline: true,
            },
        ])
        .setFooter({
            text: `ID: ${giveaway.id}`,
        })
        .setTimestamp()

    let msg
    try {
        msg = await channel.send({ embeds: [embed.toJSON()] })
        await msg.react('🎉')
        // Save message ID only after successful post
        await giveawayService.updateMessageId(giveaway.id, msg.id)
    } catch (err) {
        // Clean up the orphan record if post fails
        await prisma.giveaway.delete({ where: { id: giveaway.id } })
        errorLog({
            message: 'Failed to post giveaway message:',
            error: err,
        })
        await interactionReply({
            interaction,
            content: {
                content:
                    '❌ Failed to post giveaway message. Please try again.',
                ephemeral: true,
            },
        })
        return
    }

    infoLog({
        message: 'giveaway start command executed',
        data: { giveawayId: giveaway.id, userId: interaction.user.id },
    })

    await interactionReply({
        interaction,
        content: {
            content: `✅ Giveaway started! React with 🎉 to enter. [Jump to message](${msg.url})`,
            ephemeral: true,
        },
    })
}

async function handleEnd(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    const giveawayId = interaction.options.getString('id', true)

    if (!interaction.guildId) {
        await interactionReply({
            interaction,
            content: { content: '❌ Guild context missing.', ephemeral: true },
        })
        return
    }

    const giveaway = await giveawayService.endById(giveawayId, interaction.guildId)
    if (!giveaway) {
        await interactionReply({
            interaction,
            content: { content: '❌ Giveaway not found.', ephemeral: true },
        })
        return
    }

    // If already ended, don't re-announce
    if (giveaway.endedAt !== null) {
        const mention =
            giveaway.winnerIds.length > 0
                ? giveaway.winnerIds.map((id) => `<@${id}>`).join(', ')
                : 'no valid entries'
        await interactionReply({
            interaction,
            content: {
                content: `ℹ️ Giveaway already ended. Winners: ${mention}`,
                ephemeral: true,
            },
        })
        return
    }

    const winners = giveaway.winnerIds
    const mention =
        winners.length > 0
            ? winners.map((id) => `<@${id}>`).join(', ')
            : 'no valid entries'

    infoLog({
        message: 'giveaway end command executed',
        data: { giveawayId, winners },
    })

    // Edit the embed and post congratulations
    if (giveaway.messageId) {
        try {
            const channel = interaction.client.channels.cache.get(
                giveaway.channelId,
            ) as TextChannel
            if (channel && channel.type === ChannelType.GuildText) {
                const msg = await channel.messages
                    .fetch(giveaway.messageId)
                    .catch(() => null)
                if (msg) {
                    const embed = buildGiveawayEmbed(giveaway.prize, winners, 'Ended')
                    await msg.edit({ embeds: [embed.toJSON()] })
                    await announceWinners(channel, giveaway.prize, winners)
                }
            }
        } catch (err) {
            errorLog({
                message: 'Error updating giveaway message:',
                error: err,
            })
        }
    }

    await interactionReply({
        interaction,
        content: {
            content: `✅ Giveaway ended. Winners: ${mention}`,
            ephemeral: true,
        },
    })
}

async function handleReroll(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    const giveawayId = interaction.options.getString('id', true)

    if (!interaction.guildId) {
        await interactionReply({
            interaction,
            content: { content: '❌ Guild context missing.', ephemeral: true },
        })
        return
    }

    const giveaway = await giveawayService.getById(giveawayId)
    if (!giveaway) {
        await interactionReply({
            interaction,
            content: { content: '❌ Giveaway not found.', ephemeral: true },
        })
        return
    }

    const winners = await giveawayService.reroll(giveawayId, interaction.guildId)
    if (!winners) {
        await interactionReply({
            interaction,
            content: { content: '❌ Giveaway has not ended yet.', ephemeral: true },
        })
        return
    }

    const mention =
        winners.length > 0
            ? winners.map((id) => `<@${id}>`).join(', ')
            : 'no valid entries'

    infoLog({
        message: 'giveaway reroll command executed',
        data: { giveawayId, winners },
    })

    // Edit the message
    if (giveaway.messageId) {
        try {
            const channel = interaction.client.channels.cache.get(
                giveaway.channelId,
            ) as TextChannel
            if (channel && channel.type === ChannelType.GuildText) {
                const msg = await channel.messages
                    .fetch(giveaway.messageId)
                    .catch(() => null)
                if (msg) {
                    const embed = buildGiveawayEmbed(giveaway.prize, winners, 'Rerolled')
                    await msg.edit({ embeds: [embed.toJSON()] })

                    if (winners.length > 0) {
                        await channel.send({
                            content: `🎉 New winners: ${mention} for ${giveaway.prize}!`,
                            allowedMentions: { users: winners },
                        })
                    }
                }
            }
        } catch (err) {
            errorLog({
                message: 'Error updating rerolled giveaway message:',
                error: err,
            })
        }
    }

    await interactionReply({
        interaction,
        content: {
            content: `✅ Giveaway rerolled. New winners: ${mention}`,
            ephemeral: true,
        },
    })
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('🎉 Manage giveaways in your server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
            sub
                .setName('start')
                .setDescription('Start a new giveaway')
                .addStringOption((opt) =>
                    opt
                        .setName('premio')
                        .setDescription(
                            'Prize for the giveaway (max 200 chars)',
                        )
                        .setRequired(true)
                        .setMaxLength(200),
                )
                .addStringOption((opt) =>
                    opt
                        .setName('duracao')
                        .setDescription(
                            'Duration (e.g., 10m, 2h, 1d — max 14d)',
                        )
                        .setRequired(true),
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('vencedores')
                        .setDescription('Number of winners (default 1)')
                        .setMinValue(1)
                        .setMaxValue(10),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('end')
                .setDescription('End a giveaway early')
                .addStringOption((opt) =>
                    opt
                        .setName('id')
                        .setDescription('Giveaway ID')
                        .setRequired(true),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('reroll')
                .setDescription('Redraw winners from an ended giveaway')
                .addStringOption((opt) =>
                    opt
                        .setName('id')
                        .setDescription('Giveaway ID')
                        .setRequired(true),
                ),
        ),
    category: 'general',
    execute: async ({ interaction }) => {
        const subcommand = (
            interaction as ChatInputCommandInteraction
        ).options.getSubcommand()

        try {
            if (subcommand === 'start') {
                await handleStart(interaction as ChatInputCommandInteraction)
            } else if (subcommand === 'end') {
                await handleEnd(interaction as ChatInputCommandInteraction)
            } else if (subcommand === 'reroll') {
                await handleReroll(interaction as ChatInputCommandInteraction)
            }
        } catch (error) {
            errorLog({
                message: 'giveaway command error:',
                error,
            })
            try {
                await interactionReply({
                    interaction,
                    content: { content: '❌ An error occurred.', ephemeral: true },
                })
            } catch (replyError) {
                errorLog({
                    message: 'Failed to send error reply for giveaway command:',
                    error: replyError,
                })
            }
        }
    },
})
