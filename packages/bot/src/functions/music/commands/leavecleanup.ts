import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { createErrorEmbed, createSuccessEmbed } from '../../../utils/general/embeds'
import type { CommandExecuteParams } from '../../../types/CommandData'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { GuildQueue } from 'discord-player'
import {
    requireGuild,
    requireQueue,
} from '../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'

async function cleanupTracksFromLeftMembers(
    queue: GuildQueue,
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    const voiceChannel = queue.channel
    if (!voiceChannel) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Error',
                        'Bot is not in a voice channel.',
                    ),
                ],
            },
        })
        return
    }

    const membersInChannel = new Set(voiceChannel.members.keys())
    const tracks = queue.tracks.toArray()

    let removedCount = 0
    for (let i = tracks.length - 1; i >= 0; i--) {
        const track = tracks[i]
        const requesterId = track.requestedBy?.id

        if (requesterId && !membersInChannel.has(requesterId)) {
            try {
                queue.node.remove(track)
                removedCount++
            } catch {
                // Track may already be removed, continue
            }
        }
    }

    const message =
        removedCount === 0
            ? '✅ No tracks to clean up — all requesters are still in the channel'
            : `🧹 Removed ${removedCount} track${removedCount === 1 ? '' : 's'} from members who left`

    await interactionReply({
        interaction,
        content: {
            embeds: [
                createSuccessEmbed('Queue cleaned up', message),
            ],
        },
    })
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('leavecleanup')
        .setDescription('🧹 Remove queued tracks from members who left the voice channel'),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return

        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')
        if (!(await requireQueue(queue, interaction))) return

        await cleanupTracksFromLeftMembers(queue, interaction)
    },
})
