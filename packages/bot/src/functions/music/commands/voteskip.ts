import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { requireGuild, requireQueue, requireCurrentTrack, requireIsPlaying } from '../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'
import { interactionReply } from '../../../utils/general/interactionReply'
import { createErrorEmbed, createSuccessEmbed } from '../../../utils/general/embeds'
import { addVote, clearVotes, getVotes, hasVoted } from '../../../utils/music/voteSkipStore'
import { guildSettingsService } from '@lucky/shared/services'
import { debugLog } from '@lucky/shared/utils'
import type { GuildMember } from 'discord.js'

const DEFAULT_THRESHOLD = 50

export default new Command({
    data: new SlashCommandBuilder()
        .setName('voteskip')
        .setDescription('🗳️ Vote to skip the current track'),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams): Promise<void> => {
        if (!(await requireGuild(interaction))) return

        const guildId = interaction.guildId!
        const { queue } = resolveGuildQueue(client, guildId)

        if (!(await requireQueue(queue, interaction))) return
        if (!(await requireCurrentTrack(queue, interaction))) return
        if (!(await requireIsPlaying(queue, interaction))) return

        const voiceChannel = queue?.channel
        if (!voiceChannel) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [createErrorEmbed('Error', 'Bot is not in a voice channel.')],
                    ephemeral: true,
                },
            })
            return
        }

        const voiceMembers = [...voiceChannel.members.values()].filter(
            (m: GuildMember) => !m.user.bot,
        )
        const eligibleCount = voiceMembers.length

        if (eligibleCount === 0) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [createErrorEmbed('Error', 'No eligible members in the voice channel.')],
                    ephemeral: true,
                },
            })
            return
        }

        const userId = interaction.user.id

        if (hasVoted(guildId, userId)) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [createErrorEmbed('Already voted', 'You have already voted to skip this track.')],
                    ephemeral: true,
                },
            })
            return
        }

        const votes = addVote(guildId, userId)
        const voteCount = votes.size

        const settings = await guildSettingsService.getGuildSettings(guildId)
        const threshold = settings?.voteSkipThreshold ?? DEFAULT_THRESHOLD
        const required = Math.ceil((eligibleCount * threshold) / 100)

        debugLog({ message: `Vote skip: ${voteCount}/${required} (${threshold}%) in guild ${guildId}` })

        if (voteCount >= required) {
            clearVotes(guildId)
            queue!.node.skip()
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            '⏭️ Vote skip passed',
                            `${voteCount}/${eligibleCount} members voted — skipping current track.`,
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
                        '🗳️ Vote recorded',
                        `${voteCount}/${required} votes needed (${threshold}% of ${eligibleCount} members). Vote to skip the current track!`,
                    ),
                ],
            },
        })
    },
})
