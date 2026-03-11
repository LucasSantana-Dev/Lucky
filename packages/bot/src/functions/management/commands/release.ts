import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js'
import Command from '../../../models/Command.js'
import { errorLog, infoLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply.js'
import {
    buildPreviewPayload,
    buildReleaseEmbeds,
    publishReleaseMessages,
    resolveEnglishReleaseData,
    resolvePortugueseSections,
    CRIATIVARIA_RELEASE_CHANNEL_ID,
} from '../handlers/releaseNotesPublisher.js'

function getPortugueseInput(interaction: {
    options: {
        getString: (_name: string, _required?: boolean) => string | null
    }
}) {
    return {
        added: interaction.options.getString('pt_added', true) ?? '-',
        changed: interaction.options.getString('pt_changed', true) ?? '-',
        fixed: interaction.options.getString('pt_fixed', true) ?? '-',
    }
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('release')
        .setDescription(
            'Publish Lucky release notes to Criativaria updates channel',
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('preview')
                .setDescription(
                    'Preview PT/EN release embeds without posting to channel',
                )
                .addStringOption((option) =>
                    option
                        .setName('version')
                        .setDescription(
                            'Version to publish (e.g. 2.6.9 or v2.6.9)',
                        )
                        .setRequired(false),
                )
                .addStringOption((option) =>
                    option
                        .setName('pt_added')
                        .setDescription(
                            'Portuguese bullets for Added section (; | or newline separated, use - if none)',
                        )
                        .setRequired(true)
                        .setMaxLength(900),
                )
                .addStringOption((option) =>
                    option
                        .setName('pt_changed')
                        .setDescription(
                            'Portuguese bullets for Changed section (; | or newline separated, use - if none)',
                        )
                        .setRequired(true)
                        .setMaxLength(900),
                )
                .addStringOption((option) =>
                    option
                        .setName('pt_fixed')
                        .setDescription(
                            'Portuguese bullets for Fixed section (; | or newline separated, use - if none)',
                        )
                        .setRequired(true)
                        .setMaxLength(900),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('publish')
                .setDescription(
                    'Publish PT/EN release embeds to Criativaria updates channel',
                )
                .addStringOption((option) =>
                    option
                        .setName('version')
                        .setDescription(
                            'Version to publish (e.g. 2.6.9 or v2.6.9)',
                        )
                        .setRequired(false),
                )
                .addStringOption((option) =>
                    option
                        .setName('pt_added')
                        .setDescription(
                            'Portuguese bullets for Added section (; | or newline separated, use - if none)',
                        )
                        .setRequired(true)
                        .setMaxLength(900),
                )
                .addStringOption((option) =>
                    option
                        .setName('pt_changed')
                        .setDescription(
                            'Portuguese bullets for Changed section (; | or newline separated, use - if none)',
                        )
                        .setRequired(true)
                        .setMaxLength(900),
                )
                .addStringOption((option) =>
                    option
                        .setName('pt_fixed')
                        .setDescription(
                            'Portuguese bullets for Fixed section (; | or newline separated, use - if none)',
                        )
                        .setRequired(true)
                        .setMaxLength(900),
                ),
        ),
    category: 'management',
    execute: async ({ interaction }) => {
        if (!interaction.guild) {
            await interactionReply({
                interaction,
                content: {
                    content:
                        '❌ This command can only be used inside a server.',
                    ephemeral: true,
                },
            })
            return
        }

        const subcommand = interaction.options.getSubcommand()
        const version = interaction.options.getString('version')

        try {
            const releaseData = resolveEnglishReleaseData(version)
            const portugueseSections = resolvePortugueseSections(
                getPortugueseInput(interaction),
            )
            const { ptEmbed, enEmbed } = buildReleaseEmbeds(
                releaseData,
                portugueseSections,
            )

            if (subcommand === 'preview') {
                const preview = buildPreviewPayload(ptEmbed, enEmbed)
                await interactionReply({
                    interaction,
                    content: {
                        embeds: preview.embeds,
                        files: preview.files,
                        ephemeral: true,
                    },
                })
                infoLog({
                    message: `release preview requested by ${interaction.user.tag} for ${interaction.guild.name} (${releaseData.version})`,
                })
                return
            }

            await publishReleaseMessages(interaction, ptEmbed, enEmbed)

            await interactionReply({
                interaction,
                content: {
                    content: `✅ Posted release ${releaseData.version} in <#${CRIATIVARIA_RELEASE_CHANNEL_ID}> (PT → EN).`,
                    ephemeral: true,
                },
            })

            infoLog({
                message: `release publish executed by ${interaction.user.tag} for ${interaction.guild.name} (${releaseData.version})`,
            })
        } catch (error) {
            errorLog({
                message: 'Failed to build or publish release notes',
                error: error as Error,
            })
            await interactionReply({
                interaction,
                content: {
                    content: `❌ ${error instanceof Error ? error.message : String(error)}`,
                    ephemeral: true,
                },
            })
        }
    },
})
