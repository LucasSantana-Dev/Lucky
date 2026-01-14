import { SlashCommandBuilder } from '@discordjs/builders'
import {
    EmbedBuilder,
    PermissionFlagsBits,
} from 'discord.js'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { requireGuild } from '../../../utils/command/commandValidations'
import { roleManagementService } from '@lukbot/shared/services'
import { errorEmbed, successEmbed } from '../../../utils/general/embeds'
import { errorLog } from '@lukbot/shared/utils'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('roleconfig')
        .setDescription('Configure mutually exclusive roles')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('set-exclusive')
                .setDescription(
                    'Set role A to automatically remove role B when added',
                )
                .addRoleOption((option) =>
                    option
                        .setName('role')
                        .setDescription('Role that triggers the exclusion')
                        .setRequired(true),
                )
                .addRoleOption((option) =>
                    option
                        .setName('excluded_role')
                        .setDescription('Role to be removed when role is added')
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('remove-exclusive')
                .setDescription('Remove an exclusive role rule')
                .addRoleOption((option) =>
                    option
                        .setName('role')
                        .setDescription('Role that triggers the exclusion')
                        .setRequired(true),
                )
                .addRoleOption((option) =>
                    option
                        .setName('excluded_role')
                        .setDescription('Role to be removed')
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('list')
                .setDescription('List all exclusive role rules in this server'),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    category: 'general',
    execute: async ({ interaction }) => {
        if (!(await requireGuild(interaction))) return

        if (!interaction.guild) return

        const subcommand = interaction.options.getSubcommand()

        try {
            if (subcommand === 'set-exclusive') {
                const role = interaction.options.getRole('role', true)
                const excludedRole = interaction.options.getRole(
                    'excluded_role',
                    true,
                )

                if (role.id === excludedRole.id) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                errorEmbed(
                                    'Error',
                                    'A role cannot exclude itself.',
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                    return
                }

                const success = await roleManagementService.setExclusiveRole(
                    interaction.guild.id,
                    role.id,
                    excludedRole.id,
                )

                if (success) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                successEmbed(
                                    'Success',
                                    `When users receive ${role.name}, ${excludedRole.name} will be automatically removed.`,
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                } else {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                errorEmbed(
                                    'Error',
                                    'Failed to set exclusive role rule.',
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                }
            } else if (subcommand === 'remove-exclusive') {
                const role = interaction.options.getRole('role', true)
                const excludedRole = interaction.options.getRole(
                    'excluded_role',
                    true,
                )

                const success = await roleManagementService.removeExclusiveRole(
                    interaction.guild.id,
                    role.id,
                    excludedRole.id,
                )

                if (success) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                successEmbed(
                                    'Success',
                                    'Exclusive role rule removed.',
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                } else {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                errorEmbed(
                                    'Error',
                                    'Exclusive role rule not found.',
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                }
            } else if (subcommand === 'list') {
                const exclusions =
                    await roleManagementService.listExclusiveRoles(
                        interaction.guild.id,
                    )

                if (exclusions.length === 0) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                errorEmbed(
                                    'No Rules',
                                    'No exclusive role rules found in this server.',
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                    return
                }

                type ExclusionType = {
                    roleId: string
                    excludedRoleId: string
                }
                const embed = new EmbedBuilder()
                    .setTitle('Exclusive Role Rules')
                    .setColor(0x5865f2)
                    .setDescription(
                        (exclusions as Array<{ roleId: string; excludedRoleId: string }>)
                            .map(
                                (exclusion, index: number) =>
                                    `${index + 1}. <@&${exclusion.roleId}> excludes <@&${exclusion.excludedRoleId}>`,
                            )
                            .join('\n'),
                    )
                    .setTimestamp()

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [embed],
                        ephemeral: true,
                    },
                })
            }
        } catch (error) {
            errorLog({
                message: 'Error in roleconfig command:',
                error,
            })

            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        errorEmbed(
                            'Error',
                            'An error occurred while processing your request.',
                        ),
                    ],
                    ephemeral: true,
                },
            })
        }
    },
})
