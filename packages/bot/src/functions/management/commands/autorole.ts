import { SlashCommandBuilder } from '@discordjs/builders'
import { PermissionFlagsBits } from 'discord.js'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { requireGuild } from '../../../utils/command/commandValidations'
import { createSuccessEmbed, createErrorEmbed, createInfoEmbed } from '../../../utils/general/embeds'
import { buildListPageEmbed } from '../../../utils/general/responseEmbeds'
import { errorLog } from '@lucky/shared/utils'
import { autoroleService } from '@lucky/shared/services'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('autorole')
        .setDescription('Manage automatic roles assigned on member join')
        .addSubcommand((sub) =>
            sub
                .setName('add')
                .setDescription('Add a role to auto-assign on member join')
                .addRoleOption((o) =>
                    o
                        .setName('role')
                        .setDescription('Role to auto-assign')
                        .setRequired(true),
                )
                .addIntegerOption((o) =>
                    o
                        .setName('delay_minutes')
                        .setDescription('Delay in minutes (0-1440, default: 0)')
                        .setMinValue(0)
                        .setMaxValue(1440)
                        .setRequired(false),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('remove')
                .setDescription('Remove a role from auto-assignment')
                .addRoleOption((o) =>
                    o
                        .setName('role')
                        .setDescription('Role to remove from auto-assignment')
                        .setRequired(true),
                ),
        )
        .addSubcommand((sub) =>
            sub.setName('list').setDescription('List all auto-assigned roles'),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    category: 'management',
    execute: async ({ interaction }) => {
        if (!(await requireGuild(interaction))) return
        if (!interaction.guild) return

        const subcommand = interaction.options.getSubcommand()

        try {
            if (subcommand === 'add') {
                const role = interaction.options.getRole('role', true)
                const delayMinutes = interaction.options.getInteger('delay_minutes') ?? 0

                await autoroleService.add(interaction.guild.id, role.id, delayMinutes)

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createSuccessEmbed(
                                'AutoRole Added',
                                `${role} will now be auto-assigned on member join${delayMinutes > 0 ? ` after ${delayMinutes} minutes` : ''}.`,
                            ),
                        ],
                    },
                })
            } else if (subcommand === 'remove') {
                const role = interaction.options.getRole('role', true)

                await autoroleService.remove(interaction.guild.id, role.id)

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createSuccessEmbed(
                                'AutoRole Removed',
                                `${role} will no longer be auto-assigned on member join.`,
                            ),
                        ],
                    },
                })
            } else if (subcommand === 'list') {
                const roles = await autoroleService.list(interaction.guild.id)

                if (roles.length === 0) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                createInfoEmbed(
                                    'AutoRoles',
                                    'No auto-assigned roles configured for this server.',
                                ),
                            ],
                        },
                    })
                    return
                }

                const items = roles.map((r) => ({
                    name: `<@&${r.roleId}>`,
                    value:
                        r.delayMinutes > 0
                            ? `Delay: ${r.delayMinutes} minute${r.delayMinutes > 1 ? 's' : ''}`
                            : 'Assigned immediately',
                    inline: false,
                }))

                const embed = buildListPageEmbed(items, 1, {
                    title: 'Auto-Assigned Roles',
                    emptyMessage: 'No auto-assigned roles configured.',
                    itemsPerPage: 10,
                })

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [embed],
                    },
                })
            }
        } catch (error) {
            errorLog({ message: 'Error in autorole command:', error })
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
