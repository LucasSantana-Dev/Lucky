import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
} from 'discord.js'
import Command from '../../../models/Command.js'
import { customCommandService } from '@lucky/shared/services'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply.js'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('customcommand')
        .setDescription('Manage custom commands')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('create')
                .setDescription('Create a new custom command')
                .addStringOption((option) =>
                    option
                        .setName('name')
                        .setDescription('Command name (without /)')
                        .setRequired(true)
                        .setMaxLength(32),
                )
                .addStringOption((option) =>
                    option
                        .setName('response')
                        .setDescription('Command response')
                        .setRequired(true)
                        .setMaxLength(2000),
                )
                .addStringOption((option) =>
                    option
                        .setName('description')
                        .setDescription('Command description')
                        .setRequired(false)
                        .setMaxLength(100),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('edit')
                .setDescription('Edit an existing custom command')
                .addStringOption((option) =>
                    option
                        .setName('name')
                        .setDescription('Command name to edit')
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName('response')
                        .setDescription('New response')
                        .setRequired(false)
                        .setMaxLength(2000),
                )
                .addStringOption((option) =>
                    option
                        .setName('description')
                        .setDescription('New description')
                        .setRequired(false)
                        .setMaxLength(100),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('delete')
                .setDescription('Delete a custom command')
                .addStringOption((option) =>
                    option
                        .setName('name')
                        .setDescription('Command name to delete')
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('list')
                .setDescription('List all custom commands'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('info')
                .setDescription('View details about a custom command')
                .addStringOption((option) =>
                    option
                        .setName('name')
                        .setDescription('Command name')
                        .setRequired(true),
                ),
        ),
    category: 'management',
    execute: async ({ interaction }) => {
        if (!interaction.guild) {
            await interactionReply({
                interaction,
                content: {
                    content: '❌ This command can only be used in a server.',
                },
            })
            return
        }

        const subcommand = interaction.options.getSubcommand()

        try {
            if (subcommand === 'create') {
                const name = interaction.options
                    .getString('name', true)
                    .toLowerCase()
                const response = interaction.options.getString('response', true)
                const description = interaction.options.getString('description')

                const existing = await customCommandService.getCommand(
                    interaction.guild.id,
                    name,
                )
                if (existing) {
                    await interactionReply({
                        interaction,
                        content: {
                            content: `❌ A command named \`${name}\` already exists.`,
                        },
                    })
                    return
                }

                await customCommandService.createCommand(
                    interaction.guild.id,
                    name,
                    response,
                    {
                        description: description || undefined,
                        createdBy: interaction.user.id,
                    },
                )

                const embed = new EmbedBuilder()
                    .setColor(0x51cf66)
                    .setTitle('✅ Custom Command Created')
                    .addFields(
                        { name: 'Name', value: name, inline: true },
                        {
                            name: 'Response',
                            value:
                                response.length > 100
                                    ? response.substring(0, 97) + '...'
                                    : response,
                        },
                    )
                    .setTimestamp()

                await interactionReply({
                    interaction,
                    content: { embeds: [embed] },
                })

                infoLog({
                    message: `Custom command "${name}" created by ${interaction.user.tag} in ${interaction.guild.name}`,
                })
            } else if (subcommand === 'edit') {
                const name = interaction.options
                    .getString('name', true)
                    .toLowerCase()
                const response = interaction.options.getString('response')
                const description = interaction.options.getString('description')

                const command = await customCommandService.getCommand(
                    interaction.guild.id,
                    name,
                )
                if (!command) {
                    await interactionReply({
                        interaction,
                        content: {
                            content: `❌ Command \`${name}\` not found.`,
                        },
                    })
                    return
                }

                const updateData: any = {}
                if (response) updateData.response = response
                if (description !== null) updateData.description = description

                await customCommandService.updateCommand(
                    interaction.guild.id,
                    name,
                    updateData,
                )

                const embed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('✏️ Custom Command Updated')
                    .addFields({ name: 'Name', value: name })
                    .setTimestamp()

                if (response) {
                    embed.addFields({
                        name: 'New Response',
                        value:
                            response.length > 100
                                ? response.substring(0, 97) + '...'
                                : response,
                    })
                }

                await interactionReply({
                    interaction,
                    content: { embeds: [embed] },
                })

                infoLog({
                    message: `Custom command "${name}" updated by ${interaction.user.tag} in ${interaction.guild.name}`,
                })
            } else if (subcommand === 'delete') {
                const name = interaction.options
                    .getString('name', true)
                    .toLowerCase()

                const command = await customCommandService.getCommand(
                    interaction.guild.id,
                    name,
                )
                if (!command) {
                    await interactionReply({
                        interaction,
                        content: {
                            content: `❌ Command \`${name}\` not found.`,
                        },
                    })
                    return
                }

                await customCommandService.deleteCommand(
                    interaction.guild.id,
                    name,
                )

                const embed = new EmbedBuilder()
                    .setColor(0xc92a2a)
                    .setTitle('🗑️ Custom Command Deleted')
                    .addFields({ name: 'Name', value: name })
                    .setTimestamp()

                await interactionReply({
                    interaction,
                    content: { embeds: [embed] },
                })

                infoLog({
                    message: `Custom command "${name}" deleted by ${interaction.user.tag} in ${interaction.guild.name}`,
                })
            } else if (subcommand === 'list') {
                const commands = await customCommandService.listCommands(
                    interaction.guild.id,
                )

                if (commands.length === 0) {
                    await interactionReply({
                        interaction,
                        content: { content: '📋 No custom commands found.' },
                    })
                    return
                }

                const embed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('📋 Custom Commands')
                    .setDescription(
                        commands
                            .map(
                                (cmd: {
                                    name: string
                                    description: string | null
                                    useCount: number
                                }) =>
                                    `**${cmd.name}** - ${cmd.description || 'No description'}\n└ Used ${cmd.useCount} times`,
                            )
                            .join('\n\n'),
                    )
                    .setFooter({ text: `Total: ${commands.length} commands` })
                    .setTimestamp()

                await interactionReply({
                    interaction,
                    content: { embeds: [embed] },
                })
            } else if (subcommand === 'info') {
                const name = interaction.options
                    .getString('name', true)
                    .toLowerCase()

                const command = await customCommandService.getCommand(
                    interaction.guild.id,
                    name,
                )
                if (!command) {
                    await interactionReply({
                        interaction,
                        content: {
                            content: `❌ Command \`${name}\` not found.`,
                        },
                    })
                    return
                }

                const embed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle(`📋 Command: ${command.name}`)
                    .addFields(
                        {
                            name: 'Response',
                            value: command.response ?? 'No response set',
                        },
                        {
                            name: 'Use Count',
                            value: command.useCount.toString(),
                            inline: true,
                        },
                        {
                            name: 'Created By',
                            value: `<@${command.createdBy}>`,
                            inline: true,
                        },
                    )
                    .setTimestamp(command.createdAt)

                if (command.description) {
                    embed.addFields({
                        name: 'Description',
                        value: command.description,
                    })
                }

                if (command.lastUsed) {
                    embed.addFields({
                        name: 'Last Used',
                        value: `<t:${Math.floor(command.lastUsed.getTime() / 1000)}:R>`,
                    })
                }

                if (command.allowedRoles.length > 0) {
                    embed.addFields({
                        name: 'Allowed Roles',
                        value: command.allowedRoles
                            .map((id: string) => `<@&${id}>`)
                            .join(', '),
                    })
                }

                await interactionReply({
                    interaction,
                    content: { embeds: [embed] },
                })
            }
        } catch (error) {
            errorLog({
                message: 'Failed to manage custom command',
                error: error as Error,
            })

            await interactionReply({
                interaction,
                content: {
                    content:
                        '❌ Failed to manage custom command. Please try again.',
                },
            })
        }
    },
})
