import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    TextChannel,
} from 'discord.js'
import type { ColorResolvable } from 'discord.js'
import Command from '../../../models/Command.js'
import { embedBuilderService, hexToDecimal } from '@lucky/shared/services'
import type { EmbedField } from '@lucky/shared/services'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply.js'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Manage embed templates')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('create')
                .setDescription('Create a new embed template')
                .addStringOption((option) =>
                    option
                        .setName('name')
                        .setDescription('Template name')
                        .setRequired(true)
                        .setMaxLength(32),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('send')
                .setDescription('Send an embed template to a channel')
                .addStringOption((option) =>
                    option
                        .setName('template')
                        .setDescription('Template name')
                        .setRequired(true),
                )
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription(
                            'Channel to send to (defaults to current)',
                        )
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('list')
                .setDescription('List all embed templates'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('delete')
                .setDescription('Delete an embed template')
                .addStringOption((option) =>
                    option
                        .setName('template')
                        .setDescription('Template name')
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

                const existing = await embedBuilderService.getTemplate(
                    interaction.guild.id,
                    name,
                )
                if (existing) {
                    await interactionReply({
                        interaction,
                        content: {
                            content: `❌ A template named \`${name}\` already exists.`,
                        },
                    })
                    return
                }

                const modal = new ModalBuilder()
                    .setCustomId(`embed_create_${name}`)
                    .setTitle('Create Embed Template')

                const titleInput = new TextInputBuilder()
                    .setCustomId('title')
                    .setLabel('Embed Title')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(256)

                const descriptionInput = new TextInputBuilder()
                    .setCustomId('description')
                    .setLabel('Embed Description')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
                    .setMaxLength(4000)

                const colorInput = new TextInputBuilder()
                    .setCustomId('color')
                    .setLabel('Embed Color (hex code, e.g., #5865F2)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(7)

                const footerInput = new TextInputBuilder()
                    .setCustomId('footer')
                    .setLabel('Footer Text')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(2048)

                const imageInput = new TextInputBuilder()
                    .setCustomId('image')
                    .setLabel('Image URL')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)

                modal.addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        titleInput,
                    ),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        descriptionInput,
                    ),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        colorInput,
                    ),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        footerInput,
                    ),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        imageInput,
                    ),
                )

                await interaction.showModal(modal)
            } else if (subcommand === 'send') {
                const templateName = interaction.options
                    .getString('template', true)
                    .toLowerCase()
                const channel =
                    interaction.options.getChannel('channel') ||
                    interaction.channel

                const template = await embedBuilderService.getTemplate(
                    interaction.guild.id,
                    templateName,
                )
                if (!template) {
                    await interactionReply({
                        interaction,
                        content: {
                            content: `❌ Template \`${templateName}\` not found.`,
                        },
                    })
                    return
                }

                const embed = new EmbedBuilder()
                if (template.title) embed.setTitle(template.title)
                if (template.description)
                    embed.setDescription(template.description)
                if (template.color)
                    embed.setColor(
                        hexToDecimal(template.color) as ColorResolvable,
                    )
                if (template.footer) embed.setFooter({ text: template.footer })
                if (template.thumbnail) embed.setThumbnail(template.thumbnail)
                if (template.image) embed.setImage(template.image)
                if (template.fields && Array.isArray(template.fields)) {
                    embed.addFields(template.fields as EmbedField[])
                }

                const targetChannel =
                    channel && 'send' in channel
                        ? (channel as TextChannel)
                        : null
                if (targetChannel) {
                    await targetChannel.send({ embeds: [embed] })
                    await embedBuilderService.incrementUsage(
                        interaction.guild.id,
                        templateName,
                    )

                    await interactionReply({
                        interaction,
                        content: { content: `✅ Embed sent to ${channel}` },
                    })

                    infoLog({
                        message: `Embed template "${templateName}" sent by ${interaction.user.tag} in ${interaction.guild.name}`,
                    })
                } else {
                    await interactionReply({
                        interaction,
                        content: { content: '❌ Invalid channel.' },
                    })
                }
            } else if (subcommand === 'list') {
                const templates = await embedBuilderService.listTemplates(
                    interaction.guild.id,
                )

                if (templates.length === 0) {
                    await interactionReply({
                        interaction,
                        content: { content: '📋 No embed templates found.' },
                    })
                    return
                }

                const embed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('📋 Embed Templates')
                    .setDescription(
                        templates
                            .map(
                                (t: {
                                    name: string
                                    description: string | null
                                    useCount: number
                                }) =>
                                    `**${t.name}** - ${t.description || 'No description'}\n└ Used ${t.useCount} times`,
                            )
                            .join('\n\n'),
                    )
                    .setFooter({ text: `Total: ${templates.length} templates` })
                    .setTimestamp()

                await interactionReply({
                    interaction,
                    content: { embeds: [embed] },
                })
            } else if (subcommand === 'delete') {
                const templateName = interaction.options
                    .getString('template', true)
                    .toLowerCase()

                const template = await embedBuilderService.getTemplate(
                    interaction.guild.id,
                    templateName,
                )
                if (!template) {
                    await interactionReply({
                        interaction,
                        content: {
                            content: `❌ Template \`${templateName}\` not found.`,
                        },
                    })
                    return
                }

                await embedBuilderService.deleteTemplate(
                    interaction.guild.id,
                    templateName,
                )

                const embed = new EmbedBuilder()
                    .setColor(0xc92a2a)
                    .setTitle('🗑️ Embed Template Deleted')
                    .addFields({ name: 'Name', value: templateName })
                    .setTimestamp()

                await interactionReply({
                    interaction,
                    content: { embeds: [embed] },
                })

                infoLog({
                    message: `Embed template "${templateName}" deleted by ${interaction.user.tag} in ${interaction.guild.name}`,
                })
            }
        } catch (error) {
            errorLog({
                message: 'Failed to manage embed template',
                error: error as Error,
            })

            await interactionReply({
                interaction,
                content: {
                    content:
                        '❌ Failed to manage embed template. Please try again.',
                },
            })
        }
    },
})
