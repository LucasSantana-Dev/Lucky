import { SlashCommandBuilder } from '@discordjs/builders'
import { debugLog, errorLog } from '@lucky/shared/utils'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    createErrorEmbed,
    createSuccessEmbed,
} from '../../../utils/general/embeds'
import { buildCommandTrackEmbed } from '../../../utils/general/responseEmbeds'
import {
    requireGuild,
    requireDJRole,
    requireQueue,
    requireCurrentTrack,
    requireIsPlaying,
} from '../../../utils/command/commandValidations'
import { clearSessionMoodCache } from '../../../utils/music/autoplay/replenisher'
import type { CommandExecuteParams } from '../../../types/CommandData'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { GuildQueue } from 'discord-player'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'

async function handleNotPlaying(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    await interactionReply({
        interaction,
        content: {
            embeds: [
                createErrorEmbed(
                    'Error',
                    "🤔 There's no music playing at the moment.",
                ),
            ],
        },
    })
}

async function playPreviousTrack(
    queue: GuildQueue,
    guildId: string,
): Promise<boolean> {
    // discord-player's history.previous() throws NoResultError when history is empty
    // Per #1239: when no previous track, restart current track from beginning
    const historyWasEmpty = queue.history.isEmpty()
    if (historyWasEmpty) {
        const currentTrack = queue.currentTrack
        if (currentTrack) {
            await queue.node.seek(0)
            debugLog({
                message: `Restarted current track in guild ${guildId}`,
            })
        }
    } else {
        await queue.history.previous(true)
        debugLog({
            message: `Played previous track in guild ${guildId}`,
        })
    }

    clearSessionMoodCache(guildId)

    setTimeout(() => {
        void (async () => {
            if (!queue.isPlaying() && queue.tracks.size > 0) {
                await queue.node.play()
            }
        })().catch((error: unknown) => {
            errorLog({
                message: `Failed to resume playback after previous in guild ${guildId}`,
                error,
            })
        })
    }, 500)

    return historyWasEmpty
}

async function sendPreviousSuccess(
    interaction: ChatInputCommandInteraction,
    queue: GuildQueue,
    historyWasEmpty: boolean,
): Promise<void> {
    const currentTrack = queue.currentTrack

    if (!currentTrack) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createSuccessEmbed(
                        '⏮️ Restarting track',
                        'No previous track found. Restarting current track.',
                    ),
                ],
            },
        })
        return
    }

    const title = historyWasEmpty
        ? '⏮️ Restarting track'
        : '⏮️ Playing previous track'
    const trackEmbed = buildCommandTrackEmbed(
        currentTrack,
        title,
        interaction.user,
    )
    await interactionReply({ interaction, content: { embeds: [trackEmbed] } })
}

async function handlePreviousError(
    error: unknown,
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    errorLog({ message: 'Error in previous command:', error })
    await interactionReply({
        interaction,
        content: {
            embeds: [
                createErrorEmbed(
                    'Error',
                    'An error occurred while trying to play the previous track.',
                ),
            ],
        },
    })
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('previous')
        .setDescription('⏮️ Play the previous track or restart the current one.'),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return
        if (!(await requireDJRole(interaction, interaction.guildId!))) return

        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')

        if (!(await requireQueue(queue, interaction))) return
        if (!(await requireCurrentTrack(queue, interaction))) return
        if (!(await requireIsPlaying(queue, interaction))) return

        if (!queue?.isPlaying()) {
            await handleNotPlaying(interaction)
            return
        }

        try {
            const historyWasEmpty = await playPreviousTrack(queue, interaction.guildId ?? '')
            await sendPreviousSuccess(interaction, queue, historyWasEmpty)
        } catch (error) {
            await handlePreviousError(error, interaction)
        }
    },
})
