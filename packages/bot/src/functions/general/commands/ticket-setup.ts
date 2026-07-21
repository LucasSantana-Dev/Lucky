import { SlashCommandBuilder } from '@discordjs/builders'
import {
    ChannelType,
    MessageFlags,
    PermissionFlagsBits,
} from 'discord.js'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    createEmbed,
    createErrorEmbed,
    createSuccessEmbed,
} from '../../../utils/general/embeds'
import { guildSettingsService } from '@lucky/shared/services'
import { requireGuild } from '../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { assertDefined } from '@lucky/shared/utils/guards'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('ticket-setup')
        .setDescription('Configure support tickets (category + agent role).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
            sub
                .setName('set')
                .setDescription(
                    'Set the support category and agent role for tickets',
                )
                .addChannelOption((opt) =>
                    opt
                        .setName('category')
                        .setDescription(
                            'Category where ticket channels will be created',
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(true),
                )
                .addRoleOption((opt) =>
                    opt
                        .setName('role')
                        .setDescription(
                            'Role granted access to every open ticket',
                        )
                        .setRequired(true),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('clear')
                .setDescription('Disable tickets by clearing category and role'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('show')
                .setDescription('Show the current ticket configuration'),
        ),
    category: 'general',
    execute: async ({ interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return
        const guildId = assertDefined(
            interaction.guildId,
            'Guild ID required after requireGuild check',
        )
        const sub = interaction.options.getSubcommand()

        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        if (sub === 'set') {
            const category = interaction.options.getChannel('category', true)
            const role = interaction.options.getRole('role', true)
            const persisted = await guildSettingsService.setGuildSettings(
                guildId,
                {
                    supportCategoryId: category.id,
                    supportAgentRoleId: role.id,
                },
            )
            if (!persisted) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'Error',
                                'Failed to save ticket settings. Please try again.',
                            ),
                        ],
                    },
                })
                return
            }
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            'Ticket Setup',
                            [
                                `Category: <#${category.id}>`,
                                `Agent role: <@&${role.id}>`,
                                '',
                                'Members can open tickets with `/ticket open`.',
                            ].join('\n'),
                        ),
                    ],
                },
            })
            return
        }

        if (sub === 'clear') {
            // null (not undefined) so GuildSettingsService writes SQL NULL and
            // actually disables tickets. undefined is stripped as "omit field".
            const persisted = await guildSettingsService.setGuildSettings(
                guildId,
                {
                    supportCategoryId: null,
                    supportAgentRoleId: null,
                },
            )
            if (!persisted) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'Error',
                                'Failed to clear ticket settings. Please try again.',
                            ),
                        ],
                    },
                })
                return
            }
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            'Ticket Setup Cleared',
                            'Tickets are disabled until you run `/ticket-setup set` again.',
                        ),
                    ],
                },
            })
            return
        }

        const settings = await guildSettingsService.getGuildSettings(guildId)
        const categoryId = settings?.supportCategoryId
        const agentRoleId = settings?.supportAgentRoleId
        const configured = Boolean(categoryId && agentRoleId)
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createEmbed({
                        title: 'Ticket Setup',
                        description: configured
                            ? [
                                  `Category: <#${categoryId}>`,
                                  `Agent role: <@&${agentRoleId}>`,
                              ].join('\n')
                            : 'Tickets are not configured. Use `/ticket-setup set` to choose a category and agent role.',
                        timestamp: true,
                    }),
                ],
            },
        })
    },
})
