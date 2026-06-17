import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders'
import { PermissionFlagsBits } from 'discord.js'
import Command from '../../../models/Command'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply'
import { TOP_GG_VOTE_URL, COLOR } from '@lucky/shared/constants'

/**
 * Build the OAuth2 invite URL for the bot using its application ID
 */
function buildInviteUrl(
    applicationId: string | undefined | null,
): string | null {
    if (!applicationId) return null

    const permissions = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
    ]

    const permissionBits = permissions.reduce((acc, perm) => acc | perm, 0n)
    const permissionValue = permissionBits.toString()

    return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(
        applicationId,
    )}&permissions=${encodeURIComponent(
        permissionValue,
    )}&scope=bot%20applications.commands`
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('🔗 Get the invite link to add Lucky to your server.'),
    category: 'general',
    execute: async ({ client, interaction }) => {
        try {
            infoLog({
                message: `invite command requested by ${interaction.user.tag}`,
            })

            const applicationId =
                client.application?.id || client.user?.id || null
            const inviteUrl = buildInviteUrl(applicationId)

            if (!inviteUrl) {
                await interactionReply({
                    interaction,
                    content: {
                        content:
                            '❌ Unable to generate invite link — bot application ID not available.',
                    },
                })
                return
            }

            const embed = new EmbedBuilder()
                .setTitle('🔗 Add Lucky to Your Server')
                .setColor(COLOR.INFO_GREEN)
                .setDescription(
                    [
                        'Click the link below to add Lucky to your Discord server. Lucky will bring music, autoplay, and moderation tools to your community.',
                        '',
                        `[🎵 Invite Lucky](${inviteUrl})`,
                        '',
                        'Already have Lucky in your server? Consider supporting us:',
                        '',
                        `[💛 Vote for Lucky on top.gg](${TOP_GG_VOTE_URL})`,
                    ].join('\n'),
                )
                .setFooter({
                    text: 'Lucky • Music Bot',
                })
                .setTimestamp()

            await interactionReply({
                interaction,
                content: { embeds: [embed.toJSON()] },
            })

            infoLog({
                message: 'invite command: Successfully sent response',
            })
        } catch (error) {
            errorLog({
                message: 'invite command error:',
                error,
            })
            try {
                await interactionReply({
                    interaction,
                    content: {
                        content:
                            '❌ An error occurred while generating the invite link.',
                    },
                })
            } catch (replyError) {
                errorLog({
                    message: 'Failed to send error reply for invite command:',
                    error: replyError,
                })
            }
        }
    },
})
