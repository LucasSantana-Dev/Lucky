import { SlashCommandBuilder } from '@discordjs/builders'
import { PermissionFlagsBits } from 'discord.js'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { requireGuild } from '../../../utils/command/commandValidations'
import {
    createSuccessEmbed,
    createErrorEmbed,
    createInfoEmbed,
} from '../../../utils/general/embeds'
import { errorLog } from '@lucky/shared/utils'
import {
    twitchSubscriberRoleService,
    twitchFollowerRoleService,
} from '@lucky/shared/services'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('twitch-subscriber-role')
        .setDescription('Assign a Discord role to Twitch channel subscribers')
        .addSubcommand((sub) =>
            sub
                .setName('setup')
                .setDescription(
                    'Configure a role to assign to Twitch subscribers',
                )
                .addStringOption((o) =>
                    o
                        .setName('twitch_channel')
                        .setDescription(
                            'Twitch channel login (e.g. criativaria)',
                        )
                        .setRequired(true),
                )
                .addRoleOption((o) =>
                    o
                        .setName('role')
                        .setDescription('Discord role to assign to subscribers')
                        .setRequired(true),
                )
                .addStringOption((o) =>
                    o
                        .setName('twitch_channel_id')
                        .setDescription('Twitch channel user ID (numeric)')
                        .setRequired(true),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('remove')
                .setDescription('Remove the subscriber role configuration'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('status')
                .setDescription('Show current subscriber role configuration'),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    category: 'management',
    execute: async ({ interaction }) => {
        if (!(await requireGuild(interaction))) return
        if (!interaction.guild) return

        const guildId = interaction.guild.id
        const sub = interaction.options.getSubcommand()

        try {
            if (sub === 'setup') {
                const twitchLogin = interaction.options.getString(
                    'twitch_channel',
                    true,
                )
                const twitchId = interaction.options.getString(
                    'twitch_channel_id',
                    true,
                )
                const role = interaction.options.getRole('role', true)

                const ok = await twitchSubscriberRoleService.configure(
                    guildId,
                    twitchId,
                    twitchLogin,
                    role.id,
                )

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            ok
                                ? createSuccessEmbed(
                                      'Twitch Subscriber Role Configured',
                                      `Users who subscribe to **${twitchLogin}** on Twitch will receive ${role}.\n\nUsers must authenticate via the community login to be tracked.`,
                                  )
                                : createErrorEmbed(
                                      'Error',
                                      'Failed to save configuration.',
                                  ),
                        ],
                    },
                })
            } else if (sub === 'remove') {
                await twitchSubscriberRoleService.removeConfig(guildId)
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createSuccessEmbed(
                                'Removed',
                                'Twitch subscriber role configuration removed.',
                            ),
                        ],
                    },
                })
            } else if (sub === 'status') {
                const config =
                    await twitchSubscriberRoleService.getConfig(guildId)
                const count =
                    await twitchFollowerRoleService.getSubscriberCount(guildId)

                if (!config) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                createInfoEmbed(
                                    'Not Configured',
                                    'No subscriber role configured for this server.',
                                ),
                            ],
                        },
                    })
                    return
                }

                const role = interaction.guild.roles.cache.get(
                    config.discordRoleId,
                )
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createInfoEmbed(
                                'Twitch Subscriber Role',
                                `**Channel:** ${config.twitchBroadcasterLogin}\n**Role:** ${role ?? config.discordRoleId}\n**Linked subscribers:** ${count}`,
                            ),
                        ],
                    },
                })
            }
        } catch (error) {
            errorLog({
                message: 'twitch-subscriber-role command error:',
                error,
            })
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Error',
                            'An unexpected error occurred.',
                        ),
                    ],
                },
            })
        }
    },
})
