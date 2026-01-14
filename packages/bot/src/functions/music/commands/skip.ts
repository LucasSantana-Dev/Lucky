import { SlashCommandBuilder } from '@discordjs/builders'
import { debugLog, errorLog } from '@lukbot/shared/utils'
import Command from '../../../models/Command'
import { interactionReply } from "../../../utils/general/interactionReply"
import { errorEmbed, successEmbed } from "../../../utils/general/embeds"
import {
    requireGuild,
    requireQueue,
    requireCurrentTrack,
    requireIsPlaying,
} from "../../../utils/command/commandValidations"
import type { CommandExecuteParams } from "../../../types/CommandData"
import type { ChatInputCommandInteraction } from 'discord.js'
import type { GuildQueue } from 'discord-player'

async function handleNotPlaying(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    await interactionReply({
        interaction,
        content: {
            embeds: [
                errorEmbed(
                    'Error',
                    "🤔 There's no music playing at the moment.",
                ),
            ],
        },
    })
}

async function skipCurrentSong(
    queue: GuildQueue,
    guildId: string,
): Promise<void> {
    queue.node.skip()

    debugLog({
        message: `Skipped current song in guild ${guildId}`,
    })

    setTimeout(() => {
        void (async () => {
            if (!queue.isPlaying() && queue.tracks.size > 0) {
                await queue.node.play()
            }
        })()
    }, 500)
}

async function sendSkipSuccess(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    await interactionReply({
        interaction,
        content: {
            embeds: [
                successEmbed(
                    '⏭️ Song skipped',
                    'The current song has been skipped.',
                ),
            ],
        },
    })
}

async function handleSkipError(
    error: unknown,
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    errorLog({ message: 'Error in skip command:', error })
    await interactionReply({
        interaction,
        content: {
            embeds: [
                errorEmbed(
                    'Error',
                    'An error occurred while trying to skip the song.',
                ),
            ],
        },
    })
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('⏭️ Skip the current song.'),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return

        const queue = client.player.nodes.get(interaction.guildId ?? '')

        if (!(await requireQueue(queue, interaction))) return
        if (!(await requireCurrentTrack(queue, interaction))) return
        if (!(await requireIsPlaying(queue, interaction))) return

        if (!queue?.isPlaying()) {
            await handleNotPlaying(interaction)
            return
        }

        try {
            await skipCurrentSong(queue, interaction.guildId ?? '')
            await sendSkipSuccess(interaction)
        } catch (error) {
            await handleSkipError(error, interaction)
        }
    },
})
