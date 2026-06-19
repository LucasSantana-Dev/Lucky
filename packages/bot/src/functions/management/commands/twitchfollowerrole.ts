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
import { twitchFollowerRoleService } from '@lucky/shared/services'
import { syncGuildFollowerRoles } from '../../../twitch/followerRoleSync'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('twitch-follower-role')
        .setDescription('Assign a Discord role to Twitch channel followers')
        .addSubcommand((sub) =>
            sub
                .setName('setup')
                .setDescription(
                    'Configure a role to assign to Twitch followers',
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
                        .setDescription('Discord role to assign to followers')
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
                .setDescription('Remove the follower role configuration'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('status')
                .setDescription('Show current follower role configuration'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('sync')
                .setDescription('Manually sync follower roles now'),
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

                const ok = await twitchFollowerRoleService.configure(
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
                                      'Twitch Follower Role Configured',
                                      `Users who follow **${twitchLogin}** on Twitch will receive ${role}.\n\nUsers must authenticate via the community login to be tracked.`,
                                  )
                                : createErrorEmbed(
                                      'Error',
                                      'Failed to save configuration.',
                                  ),
                        ],
                    },
                })
            } else if (sub === 'remove') {
                await twitchFollowerRoleService.removeConfig(guildId)
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createSuccessEmbed(
                                'Removed',
                                'Twitch follower role configuration removed.',
                            ),
                        ],
                    },
                })
            } else if (sub === 'status') {
                const config =
                    await twitchFollowerRoleService.getConfig(guildId)
                const count =
                    await twitchFollowerRoleService.getLinkCount(guildId)

                if (!config) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                createInfoEmbed(
                                    'Not Configured',
                                    'No follower role configured for this server.',
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
                                'Twitch Follower Role',
                                `**Channel:** ${config.twitchBroadcasterLogin}\n**Role:** ${role ?? config.discordRoleId}\n**Linked users:** ${count}`,
                            ),
                        ],
                    },
                })
            } else if (sub === 'sync') {
                await interaction.deferReply({ ephemeral: true })
                const result = await syncGuildFollowerRoles(
                    guildId,
                    interaction.client,
                )
                await interaction.editReply({
                    embeds: [
                        createSuccessEmbed(
                            'Sync Complete',
                            `Updated ${result.updated} member(s). Errors: ${result.errors}.`,
                        ),
                    ],
                })
            }
        } catch (error) {
            errorLog({ message: 'twitch-follower-role command error:', error })
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
