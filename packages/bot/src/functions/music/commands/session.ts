import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    infoEmbed,
    successEmbed,
    warningEmbed,
    errorEmbed,
} from '../../../utils/general/embeds'
import type { CommandExecuteParams } from '../../../types/CommandData'
import {
    requireGuild,
    requireVoiceChannel,
} from '../../../utils/command/commandValidations'
import { musicSessionSnapshotService } from '../../../utils/music/sessionSnapshots'
import { createQueue, queueConnect } from '../../../handlers/queueHandler'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('session')
        .setDescription('💾 Save or restore the current music session')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('save')
                .setDescription('Save current queue session snapshot'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('restore')
                .setDescription('Restore last saved queue session'),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return

        const guildId = interaction.guildId
        if (!guildId) return

        const subcommand = interaction.options.getSubcommand()

        if (subcommand === 'save') {
            const queue = client.player.nodes.get(guildId)
            if (!queue) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            warningEmbed(
                                'No active queue',
                                'Start playing music before saving a session snapshot.',
                            ),
                        ],
                        ephemeral: true,
                    },
                })
                return
            }

            const snapshot =
                await musicSessionSnapshotService.saveSnapshot(queue)
            if (!snapshot) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            warningEmbed(
                                'Nothing to save',
                                'Queue snapshot was not saved because there are no tracks.',
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
                        successEmbed(
                            'Session saved',
                            `Snapshot ID: ${snapshot.sessionSnapshotId}\nTracks saved: ${snapshot.upcomingTracks.length}`,
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        if (!(await requireVoiceChannel(interaction))) return

        let queue = client.player.nodes.get(guildId)
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
                        errorEmbed(
                            'Connection error',
                            'Could not connect to your voice channel.',
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        const restored = await musicSessionSnapshotService.restoreSnapshot(
            queue,
            interaction.user,
        )

        if (restored.restoredCount === 0) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        infoEmbed(
                            'No snapshot restored',
                            'No saved session was found or queue is already populated.',
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
                    successEmbed(
                        'Session restored',
                        `Restored ${restored.restoredCount} tracks from snapshot ${restored.sessionSnapshotId}.`,
                    ),
                ],
            },
        })
    },
})
