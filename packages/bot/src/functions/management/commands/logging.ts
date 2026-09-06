import {
    type ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    createErrorEmbed,
    createSuccessEmbed,
} from '../../../utils/general/embeds'
import { logSettingsService, type IgnoreKind } from '@lucky/shared/services'
import { errorLog, captureException } from '@lucky/shared/utils'
import { requireGuild } from '../../../utils/command/commandValidations'
import { assertDefined } from '@lucky/shared/utils/guards'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { COLOR } from '@lucky/shared/constants'

/** Resolves the single target id/kind from the mutually-exclusive channel/role/user options. */
function resolveTarget(
    interaction: ChatInputCommandInteraction,
): { kind: IgnoreKind; id: string; label: string } | null {
    const channel = interaction.options.getChannel('channel')
    const role = interaction.options.getRole('role')
    const user = interaction.options.getUser('user')

    const provided = [channel, role, user].filter(Boolean)
    if (provided.length !== 1) {
        return null
    }

    if (channel)
        return { kind: 'channel', id: channel.id, label: `<#${channel.id}>` }
    if (role) return { kind: 'role', id: role.id, label: `<@&${role.id}>` }
    if (user) return { kind: 'user', id: user.id, label: `<@${user.id}>` }
    return null
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription(
            'Configure which channels/roles/users are excluded from server logs',
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
            sub
                .setName('ignore-add')
                .setDescription(
                    'Exclude a channel, role, or user from server logs',
                )
                .addChannelOption((opt) =>
                    opt
                        .setName('channel')
                        .setDescription('Channel to exclude')
                        .setRequired(false),
                )
                .addRoleOption((opt) =>
                    opt
                        .setName('role')
                        .setDescription(
                            'Role to exclude (members with this role)',
                        )
                        .setRequired(false),
                )
                .addUserOption((opt) =>
                    opt
                        .setName('user')
                        .setDescription('User to exclude')
                        .setRequired(false),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('ignore-remove')
                .setDescription(
                    'Re-include a previously excluded channel, role, or user',
                )
                .addChannelOption((opt) =>
                    opt
                        .setName('channel')
                        .setDescription('Channel to re-include')
                        .setRequired(false),
                )
                .addRoleOption((opt) =>
                    opt
                        .setName('role')
                        .setDescription('Role to re-include')
                        .setRequired(false),
                )
                .addUserOption((opt) =>
                    opt
                        .setName('user')
                        .setDescription('User to re-include')
                        .setRequired(false),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('list')
                .setDescription(
                    'List all channels/roles/users excluded from server logs',
                ),
        ),
    category: 'management',
    execute: async ({ interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return
        const guildId = assertDefined(
            interaction.guildId,
            'Guild ID required after requireGuild check',
        )

        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        const subcommand = interaction.options.getSubcommand()

        try {
            if (subcommand === 'ignore-add') {
                await handleIgnoreAdd(interaction, guildId)
            } else if (subcommand === 'ignore-remove') {
                await handleIgnoreRemove(interaction, guildId)
            } else if (subcommand === 'list') {
                await handleList(interaction, guildId)
            }
        } catch (error) {
            errorLog({
                message: 'Error executing logging command:',
                error,
            })
            captureException(
                error instanceof Error ? error : new Error(String(error)),
                {
                    context: 'logging.execute',
                },
            )
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Error',
                            'An error occurred while processing your request.',
                        ),
                    ],
                },
            })
        }
    },
})

async function handleIgnoreAdd(
    interaction: ChatInputCommandInteraction,
    guildId: string,
) {
    const target = resolveTarget(interaction)
    if (!target) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Error',
                        'Provide exactly one of `channel`, `role`, or `user`.',
                    ),
                ],
            },
        })
        return
    }

    await logSettingsService.addIgnored(guildId, target.kind, target.id)

    await interactionReply({
        interaction,
        content: {
            embeds: [
                createSuccessEmbed(
                    'Excluded',
                    `${target.label} will no longer appear in server logs.`,
                ),
            ],
        },
    })
}

async function handleIgnoreRemove(
    interaction: ChatInputCommandInteraction,
    guildId: string,
) {
    const target = resolveTarget(interaction)
    if (!target) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Error',
                        'Provide exactly one of `channel`, `role`, or `user`.',
                    ),
                ],
            },
        })
        return
    }

    await logSettingsService.removeIgnored(guildId, target.kind, target.id)

    await interactionReply({
        interaction,
        content: {
            embeds: [
                createSuccessEmbed(
                    'Re-included',
                    `${target.label} will now appear in server logs again.`,
                ),
            ],
        },
    })
}

async function handleList(
    interaction: ChatInputCommandInteraction,
    guildId: string,
) {
    const config = await logSettingsService.getConfig(guildId)

    if (
        !config ||
        (config.ignoredChannelIds.length === 0 &&
            config.ignoredRoleIds.length === 0 &&
            config.ignoredUserIds.length === 0)
    ) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Server Log Exclusions')
                        .setDescription('Nothing is currently excluded.')
                        .setColor(COLOR.SETUP_PURPLE),
                ],
            },
        })
        return
    }

    const fields = []
    if (config.ignoredChannelIds.length > 0) {
        fields.push({
            name: 'Channels',
            value: config.ignoredChannelIds.map((id) => `<#${id}>`).join(', '),
        })
    }
    if (config.ignoredRoleIds.length > 0) {
        fields.push({
            name: 'Roles',
            value: config.ignoredRoleIds.map((id) => `<@&${id}>`).join(', '),
        })
    }
    if (config.ignoredUserIds.length > 0) {
        fields.push({
            name: 'Users',
            value: config.ignoredUserIds.map((id) => `<@${id}>`).join(', '),
        })
    }

    const embed = new EmbedBuilder()
        .setTitle('Server Log Exclusions')
        .setColor(COLOR.SETUP_PURPLE)
        .addFields(fields)

    await interactionReply({
        interaction,
        content: { embeds: [embed] },
    })
}
