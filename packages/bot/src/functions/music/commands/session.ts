import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    createInfoEmbed,
    createSuccessEmbed,
    createWarningEmbed,
    createErrorEmbed,
} from '../../../utils/general/embeds'
import type { CommandExecuteParams } from '../../../types/CommandData'
import {
    requireGuild,
    requireVoiceChannel,
} from '../../../utils/command/commandValidations'
import { musicSessionSnapshotService } from '../../../utils/music/sessionSnapshots'
import { namedSessionService } from '../../../utils/music/namedSessions'
import { createQueue, queueConnect } from '../../../handlers/queueHandler'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('session')
        .setDescription('💾 Save or restore music sessions')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('save')
                .setDescription('Save current queue as a named session')
                .addStringOption((opt) =>
                    opt
                        .setName('name')
                        .setDescription('Session name (e.g., party-mix)')
                        .setRequired(true)
                        .setMaxLength(32),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('restore')
                .setDescription('Restore a previously saved session')
                .addStringOption((opt) =>
                    opt
                        .setName('name')
                        .setDescription('Session name to restore')
                        .setRequired(true)
                        .setAutocomplete(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('list')
                .setDescription('Show all saved sessions for this server'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('delete')
                .setDescription('Delete a saved session')
                .addStringOption((opt) =>
                    opt
                        .setName('name')
                        .setDescription('Session name to delete')
                        .setRequired(true)
                        .setAutocomplete(true),
                ),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return

        const guildId = interaction.guildId
        if (!guildId) return

        const subcommand = interaction.options.getSubcommand()

        if (subcommand === 'save') {
            const name = interaction.options.getString('name', true).toLowerCase()

            const { queue } = resolveGuildQueue(client, guildId)
            if (!queue) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createWarningEmbed(
                                'No active queue',
                                'Start playing music before saving a session.',
                            ),
                        ],
                        ephemeral: true,
                    },
                })
                return
            }

            const session = await namedSessionService.save(
                queue,
                name,
                interaction.user.id,
            )

            if (!session) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createWarningEmbed(
                                'Could not save session',
                                'Session name already exists, is invalid, or max sessions reached (10 per server).',
                            ),
                        ],
                        ephemeral: true,
                    },
                })
                return
            }

            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            'Session saved',
                            `**${session.name}** — ${session.trackCount} tracks`,
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        if (subcommand === 'list') {
            const sessions = await namedSessionService.list(guildId)

            if (sessions.length === 0) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createInfoEmbed(
                                'No saved sessions',
                                'Use `/session save` to create one.',
                            ),
                        ],
                        ephemeral: true,
                    },
                })
                return
            }

            const descriptions = sessions.map((s) => {
                const age = Math.round((Date.now() - s.savedAt) / 1000 / 60)
                return `**${s.name}** — ${s.trackCount} tracks, saved by <@${s.savedBy}> ${age}m ago`
            })

            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createInfoEmbed(
                            'Saved Sessions',
                            descriptions.join('\n'),
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        if (subcommand === 'restore' || subcommand === 'delete') {
            const name = interaction.options.getString('name', true).toLowerCase()

            if (subcommand === 'delete') {
                const deleted = await namedSessionService.delete(guildId, name)
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            deleted
                                ? createSuccessEmbed(
                                      'Session deleted',
                                      `**${name}** has been removed.`,
                                  )
                                : createWarningEmbed(
                                      'Session not found',
                                      `Could not find **${name}**.`,
                                  ),
                        ],
                        ephemeral: true,
                    },
                })
                return
            }

            if (!(await requireVoiceChannel(interaction))) return

            let queue = resolveGuildQueue(client, guildId).queue
            if (!queue) {
                queue = await createQueue({ client, interaction })
            }

            try {
                await queueConnect({ queue, interaction })
            } catch {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'Connection error',
                                'Could not connect to your voice channel.',
                            ),
                        ],
                        ephemeral: true,
                    },
                })
                return
            }

            const result = await namedSessionService.restore(
                queue,
                name,
                interaction.user,
            )

            if (result.restoredCount === 0) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createWarningEmbed(
                                'Session not found',
                                `Could not find **${name}**.`,
                            ),
                        ],
                        ephemeral: true,
                    },
                })
                return
            }

            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            'Session restored',
                            `Restored ${result.restoredCount} tracks from **${name}**.`,
                        ),
                    ],
                },
            })
        }
    },
})
