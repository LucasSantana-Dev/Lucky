import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { createErrorEmbed, createSuccessEmbed } from '../../../utils/general/embeds'
import {
    requireGuild,
    requireQueue,
    requireCurrentTrack,
    requireVoiceChannel,
} from '../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'
import { smartShuffle } from '../../../utils/music/queue/smartShuffle'

const STREAK_LIMIT = parseInt(process.env.SMART_SHUFFLE_STREAK_LIMIT ?? '2', 10)

export default new Command({
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffle the music queue.')
        .addSubcommand((sub) =>
            sub
                .setName('random')
                .setDescription('Randomly shuffle the queue.'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('smart')
                .setDescription(
                    'Smart shuffle: interleaves high/low energy tracks and limits requester streaks.',
                ),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return
        if (!(await requireVoiceChannel(interaction))) return

        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')
        if (!(await requireQueue(queue, interaction))) return
        if (!(await requireCurrentTrack(queue, interaction))) return

        if ((queue?.tracks.size ?? 0) < 2) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Error',
                            'The queue needs at least 2 songs to be shuffled!',
                        ),
                    ],
                },
            })
            return
        }

        const subcommand = interaction.options.getSubcommand(false) ?? 'random'

        if (subcommand === 'smart') {
            const tracks = queue!.tracks.toArray()
            const shuffled = smartShuffle(tracks, { streakLimit: STREAK_LIMIT })
            queue!.tracks.clear()
            for (const track of shuffled) {
                queue!.tracks.add(track)
            }
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            'Queue smart-shuffled',
                            'The queue has been smart-shuffled: high-energy tracks first, requester streaks limited.',
                        ),
                    ],
                },
            })
        } else {
            queue?.tracks.shuffle()
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            'Queue shuffled',
                            'The music queue has been shuffled successfully!',
                        ),
                    ],
                },
            })
        }
    },
})
