import { SlashCommandBuilder } from '@discordjs/builders'
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
import { PermissionFlagsBits } from 'discord.js'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('djrole')
        .setDescription('🎧 Configure the DJ role for music command access.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
            sub
                .setName('set')
                .setDescription('Restrict music commands to a specific role')
                .addRoleOption((opt) =>
                    opt.setName('role').setDescription('The DJ role').setRequired(true),
                ),
        )
        .addSubcommand((sub) =>
            sub.setName('clear').setDescription('Remove the DJ role restriction'),
        )
        .addSubcommand((sub) =>
            sub.setName('show').setDescription('Show the current DJ role setting'),
        ),
    category: 'music',
    execute: async ({ interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return
        const guildId = interaction.guildId!
        const sub = interaction.options.getSubcommand()

        await interaction.deferReply({ ephemeral: true })

        if (sub === 'set') {
            const role = interaction.options.getRole('role', true)
            const persisted = await guildSettingsService.setGuildSettings(guildId, {
                djRoleId: role.id,
            })
            if (!persisted) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'Error',
                                'Failed to save DJ role. Please try again.',
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
                            '🎧 DJ Role Set',
                            `Music commands are now restricted to members with <@&${role.id}>.`,
                        ),
                    ],
                },
            })
        } else if (sub === 'clear') {
            const persisted = await guildSettingsService.setGuildSettings(guildId, {
                djRoleId: undefined,
            })
            if (!persisted) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'Error',
                                'Failed to clear DJ role. Please try again.',
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
                            '🎧 DJ Role Cleared',
                            'Music commands are now accessible to everyone.',
                        ),
                    ],
                },
            })
        } else {
            const settings = await guildSettingsService.getGuildSettings(guildId)
            const djRoleId = settings?.djRoleId
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createEmbed({
                            title: '🎧 DJ Role',
                            description: djRoleId
                                ? `Current DJ role: <@&${djRoleId}>`
                                : 'No DJ role configured — music commands are open to everyone.',
                            timestamp: true,
                        }),
                    ],
                },
            })
        }
    },
})
