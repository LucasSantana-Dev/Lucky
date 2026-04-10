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
        .setName('lockdown')
        .setDescription('Toggle lockdown mode for a channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addChannelOption((option) =>
            option
                .setName('channel')
                .setDescription('Channel to lock (defaults to current channel)')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription('Reason for lockdown')
                .setRequired(false),
        ),
    category: 'moderation',
    execute: async ({ interaction }) => {
        if (!interaction.guild) {
            await interactionReply({
                interaction,
                content: {
                    content: '❌ This command can only be used in a server.',
                },
            })
            return
        }

        const channel =
            (interaction.options.getChannel('channel') as any) ||
            interaction.channel
        const reason =
            interaction.options.getString('reason') || 'No reason provided'

        if (!channel || channel.type !== ChannelType.GuildText) {
            await interactionReply({
                interaction,
                content: {
                    content: '❌ This command can only be used in text channels.',
                },
            })
            return
        }

        try {
            const everyone = interaction.guild.roles.everyone
            const currentOverwrite = channel.permissionOverwrites.cache.get(
                everyone.id,
            )

            const isSendMessagesBlocked =
                currentOverwrite?.deny?.has(PermissionFlagsBits.SendMessages)

            let isLocking: boolean
            let action: string

            if (isSendMessagesBlocked) {
                await channel.permissionOverwrites.edit(everyone, {
                    SendMessages: null,
                })
                isLocking = false
                action = 'unlocked'
            } else {
                await channel.permissionOverwrites.edit(everyone, {
                    SendMessages: false,
                })
                isLocking = true
                action = 'locked'
            }

            const embed = new EmbedBuilder()
                .setColor(isLocking ? 0xf44336 : 0x4caf50)
                .setTitle(isLocking ? '🔒 Channel Locked' : '🔓 Channel Unlocked')
                .addFields({
                    name: 'Channel',
                    value: `${channel}`,
                })

            if (reason) {
                embed.addFields({
                    name: 'Reason',
                    value: reason,
                })
            }

            embed.addFields({
                name: 'Moderator',
                value: interaction.user.tag,
            }).setTimestamp()

            await interactionReply({
                interaction,
                content: { embeds: [embed] },
            })

            infoLog({
                message: `${interaction.user.tag} ${action} #${channel.name} in ${interaction.guild.name}${reason ? ` - Reason: ${reason}` : ''}`,
            })
        } catch (error) {
            errorLog({
                message: 'Failed to toggle channel lockdown',
                error: error as Error,
            })

            await interactionReply({
                interaction,
                content: {
                    content:
                        '❌ Failed to toggle lockdown. Please check permissions and try again.',
                },
            })
        }
    },
})
