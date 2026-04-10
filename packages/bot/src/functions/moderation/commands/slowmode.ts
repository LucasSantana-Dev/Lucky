import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    TextChannel,
} from 'discord.js'
import Command from '../../../models/Command.js'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply.js'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set slowmode for the current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addIntegerOption((option) =>
            option
                .setName('seconds')
                .setDescription('Slowmode duration in seconds (0 to disable)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(21600),
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

        const seconds = interaction.options.getInteger('seconds', true)

        try {
            await (interaction.channel as TextChannel).setRateLimitPerUser(seconds)

            const formatDuration = (sec: number): string => {
                if (sec === 0) return 'disabled'
                if (sec < 60) return `${sec}s`
                if (sec < 3600) return `${Math.floor(sec / 60)}m`
                return `${Math.floor(sec / 3600)}h`
            }

            const embed = new EmbedBuilder()
                .setColor(seconds === 0 ? 0x4caf50 : 0xff9800)
                .setTitle(
                    seconds === 0 ? '⏱️ Slowmode Disabled' : '⏱️ Slowmode Enabled',
                )
                .addFields({
                    name: 'Duration',
                    value: formatDuration(seconds),
                })
                .addFields({
                    name: 'Moderator',
                    value: interaction.user.tag,
                })
                .setTimestamp()

            await interactionReply({
                interaction,
                content: { embeds: [embed] },
            })

            const action = seconds === 0 ? 'disabled slowmode' : `set slowmode to ${formatDuration(seconds)}`
            const channelName = (interaction.channel as TextChannel).name
            infoLog({
                message: `${interaction.user.tag} ${action} in #${channelName} (${interaction.guild.name})`,
            })
        } catch (error) {
            errorLog({
                message: 'Failed to set slowmode',
                error: error as Error,
            })

            await interactionReply({
                interaction,
                content: {
                    content:
                        '❌ Failed to set slowmode. Please check permissions and try again.',
                },
            })
        }
    },
})
