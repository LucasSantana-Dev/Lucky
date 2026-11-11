import { SlashCommandBuilder } from '@discordjs/builders'
import { debugLog, errorLog } from '@lucky/shared/utils'
import { replyNotPlaying } from '../../../utils/music/replyNotPlaying'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    createErrorEmbed,
    createSuccessEmbed,
} from '../../../utils/general/embeds'
import { buildCommandTrackEmbed } from '../../../utils/general/responseEmbeds'
import {
    requireGuild,
    requireDJRoleInGuild,
    requireQueue,
    requireCurrentTrack,
    requireIsPlaying,
} from '../../../utils/command/commandValidations'
import { clearSessionMoodCache } from '../../../services/musicRecommendation/autoplay/replenisher'
import type { CommandExecuteParams } from '../../../types/CommandData'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { GuildQueue } from 'discord-player'
import {
    captureAutoplayTrack,
    maybePromptAutoplayFeedback,
} from '../../../services/musicRecommendation/autoplayFeedbackPrompt'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'

async function skipCurrentSong(
    queue: GuildQueue,
    guildId: string,
): Promise<void> {
    const skipped = queue.currentTrack
    queue.node.skip()
    clearSessionMoodCache(guildId)

    debugLog({
        message: `Skipped current song in guild ${guildId}`,
    })

    setTimeout(() => {
        void (async () => {
            // A different current track means discord-player already moved on
            // and is still resolving its stream (seconds through the bridge).
            // play() would dispatch the track behind it, so a request at the
            // head of the queue lost its turn to the autoplay pick after it.
            const advanced =
                queue.currentTrack != null && queue.currentTrack !== skipped
            if (!advanced && !queue.isPlaying() && queue.tracks.size > 0) {
                await queue.node.play()
            }
        })().catch((error: unknown) => {
            errorLog({
                message: `Failed to resume playback after skip in guild ${guildId}`,
                error,
            })
        })
    }, 500)
}

async function sendSkipSuccess(
    interaction: ChatInputCommandInteraction,
    queue: GuildQueue,
): Promise<void> {
    const nextTrack = queue.currentTrack

    if (!nextTrack) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createSuccessEmbed(
                        '⏭️ Song skipped',
                        'The current song has been skipped.',
                    ),
                ],
            },
        })
        return
    }

    const trackEmbed = buildCommandTrackEmbed(
        nextTrack,
        '⏭️ Song skipped - Now playing',
        interaction.user,
    )
    await interactionReply({ interaction, content: { embeds: [trackEmbed] } })
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
                createErrorEmbed(
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

        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')

        // Cheap synchronous checks run before the defer so their errors keep
        // replying ephemerally (a deferred reply cannot turn ephemeral).
        if (!(await requireQueue(queue, interaction))) return
        if (!(await requireCurrentTrack(queue, interaction))) return
        if (!(await requireIsPlaying(queue, interaction))) return

        if (!queue?.isPlaying()) {
            await replyNotPlaying(interaction)
            return
        }

        // Acknowledge before the DJ lookup (a DB call) and the skip itself,
        // which can exceed Discord's 3s window. If the defer fails (e.g. 10062
        // Unknown interaction) the skip still runs; interactionReply swallows
        // the later reply failures.
        try {
            await interaction.deferReply()
        } catch (error) {
            debugLog({
                message: `Skip defer failed in guild ${interaction.guildId}, skipping anyway`,
                error,
            })
        }

        if (!(await requireDJRoleInGuild(interaction, 'requireGuild'))) return

        // Before the skip: afterwards currentTrack is the next song.
        const skippedAutoplay = captureAutoplayTrack(queue.currentTrack)

        try {
            await skipCurrentSong(queue, interaction.guildId ?? '')
            await sendSkipSuccess(interaction, queue)
            await maybePromptAutoplayFeedback(interaction, skippedAutoplay)
        } catch (error) {
            await handleSkipError(error, interaction)
        }
    },
})
