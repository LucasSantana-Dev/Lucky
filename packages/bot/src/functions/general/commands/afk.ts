import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { afkService } from '@lucky/shared/services'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply'

const MAX_REASON_LENGTH = 200

export default new Command({
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Set or clear your AFK status.')
        .addStringOption((option) =>
            option
                .setName('motivo')
                .setDescription('Reason for being away (optional, max 200 chars).')
                .setMaxLength(MAX_REASON_LENGTH)
                .setRequired(false),
        ),
    category: 'general',
    execute: async ({ interaction }) => {
        try {
            const guildId = interaction.guild?.id
            const userId = interaction.user.id
            const motivo = interaction.options.getString('motivo')

            if (!guildId) {
                await interactionReply({
                    interaction,
                    content: { content: '❌ Unable to determine guild.', ephemeral: true },
                })
                return
            }

            if (!motivo) {
                // Toggle off AFK status
                await afkService.clear(guildId, userId)
                await interactionReply({
                    interaction,
                    content: {
                        content: '✅ Welcome back! Your AFK status has been cleared.',
                        ephemeral: true,
                    },
                })
                infoLog({
                    message: `AFK status cleared for ${interaction.user.tag} in guild ${guildId}`,
                })
                return
            }

            // Set AFK status with reason
            await afkService.set(guildId, userId, motivo)
            await interactionReply({
                interaction,
                content: {
                    content: `✅ AFK set${motivo ? `: ${motivo}` : ''}.`,
                    ephemeral: true,
                },
            })
            infoLog({
                message: `AFK status set for ${interaction.user.tag} in guild ${guildId}: ${motivo}`,
            })
        } catch (error) {
            errorLog({
                message: 'Error handling /afk command:',
                error,
            })
            try {
                await interactionReply({
                    interaction,
                    content: { content: '❌ Failed to update AFK status.', ephemeral: true },
                })
            } catch (replyError) {
                errorLog({
                    message: 'Failed to send error reply for /afk command:',
                    error: replyError,
                })
            }
        }
    },
})
