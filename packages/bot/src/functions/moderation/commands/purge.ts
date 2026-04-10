import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ChannelType,
} from 'discord.js'
import Command from '../../../models/Command.js'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply.js'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Delete messages from the channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption((option) =>
            option
                .setName('amount')
                .setDescription('Number of messages to delete (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100),
        )
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('Filter by user (optional)')
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName('contains')
                .setDescription('Filter by text content (case-insensitive, optional)')
                .setRequired(false),
        ),
    category: 'moderation',
    execute: async ({ interaction }) => {
        if (!interaction.guild || !interaction.channel) {
            await interactionReply({
                interaction,
                content: {
                    content: '❌ This command can only be used in a server.',
                },
            })
            return
        }

        if (interaction.channel.type !== ChannelType.GuildText) {
            await interactionReply({
                interaction,
                content: {
                    content: '❌ This command can only be used in text channels.',
                },
            })
            return
        }

        const amount = interaction.options.getInteger('amount', true)
        const filterUser = interaction.options.getUser('user')
        const filterText = interaction.options.getString('contains')?.toLowerCase()

        try {
            const messages = await interaction.channel.messages.fetch({
                limit: 100,
            })

            const now = Date.now()
            const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000

            let filtered = Array.from(messages.values()).filter((msg) => {
                if (now - msg.createdTimestamp > fourteenDaysMs) {
                    return false
                }

                if (filterUser && msg.author.id !== filterUser.id) {
                    return false
                }

                if (filterText && !msg.content.toLowerCase().includes(filterText)) {
                    return false
                }

                return true
            })

            filtered = filtered.slice(0, amount)

            if (filtered.length === 0) {
                await interactionReply({
                    interaction,
                    content: {
                        content: '❌ No messages found matching your criteria.',
                    },
                })
                return
            }

            await interaction.channel.bulkDelete(filtered, true)

            const embed = new EmbedBuilder()
                .setColor(0x9c27b0)
                .setTitle('🗑️ Messages Purged')
                .addFields({
                    name: 'Deleted',
                    value: `${filtered.length} message${filtered.length !== 1 ? 's' : ''}`,
                })
                .setTimestamp()

            if (filterUser) {
                embed.addFields({
                    name: 'Filter',
                    value: `From ${filterUser.tag}`,
                })
            }

            if (filterText) {
                embed.addFields({
                    name: 'Text Filter',
                    value: filterText,
                })
            }

            await interactionReply({
                interaction,
                content: { embeds: [embed] },
            })

            infoLog({
                message: `${interaction.user.tag} purged ${filtered.length} messages in ${interaction.guild.name}`,
            })
        } catch (error) {
            errorLog({
                message: 'Failed to purge messages',
                error: error as Error,
            })

            await interactionReply({
                interaction,
                content: {
                    content:
                        '❌ Failed to purge messages. Please check permissions and try again.',
                },
            })
        }
    },
})
