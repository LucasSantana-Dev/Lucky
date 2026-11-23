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
import { translatorForInteraction } from '../../../i18n/translatorForInteraction'
import {
    requireGuild,
    requireDJRoleInGuild,
    requireQueue,
    requireCurrentTrack,
    requireIsPlaying,
    requireSameVoiceChannel,
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

// A second /skip that resolves while the first is still switching tracks
// sees the same currentTrack; without this it would skip the next song too.
const SKIP_DEDUPE_MS = 5_000
const recentSkips = new Map<string, { track: unknown; at: number }>()

function claimSkip(guildId: string, track: unknown): boolean {
    const last = recentSkips.get(guildId)
    const now = Date.now()
    if (last && last.track === track && now - last.at < SKIP_DEDUPE_MS)
        return false
    recentSkips.set(guildId, { track, at: now })
    return true
}

async function promptFeedbackSafely(
    interaction: ChatInputCommandInteraction,
    skippedAutoplay: ReturnType<typeof captureAutoplayTrack>,
): Promise<void> {
    try {
        await maybePromptAutoplayFeedback(interaction, skippedAutoplay)
    } catch (error) {
        // The skip already worked; a failed prompt must not report an error.
        errorLog({
            message: 'Autoplay feedback prompt failed after skip',
            error,
        })
    }
}

async function skipCurrentSong(
    queue: GuildQueue,
    guildId: string,
): Promise<void> {
    queue.node.skip()
    clearSessionMoodCache(guildId)

    debugLog({
        message: `Skipped current song in guild ${guildId}`,
    })

    setTimeout(() => {
        void (async () => {
            // Any current track means discord-player already picked what plays
            // next (the next request, or the same track on repeat) and is still
            // resolving its stream (seconds through the bridge). play() would
            // dispatch the track behind it, so a request at the head of the
            // queue lost its turn to the autoplay pick after it.
            if (
                queue.currentTrack == null &&
                !queue.isPlaying() &&
                queue.tracks.size > 0
            ) {
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

    const t = await translatorForInteraction(interaction)
    const trackEmbed = buildCommandTrackEmbed(
        nextTrack,
        t('music.messages.statusSkipped'),
        interaction.user,
        'skipped',
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
        if (!(await requireSameVoiceChannel(queue, interaction))) return

        // Cheap synchronous checks run before the defer so their errors keep
        // replying ephemerally (a deferred reply cannot turn ephemeral).
        if (!(await requireQueue(queue, interaction))) return
        if (!(await requireCurrentTrack(queue, interaction))) return
        if (!(await requireIsPlaying(queue, interaction))) return

        if (!queue?.isPlaying()) {
            await replyNotPlaying(interaction)
            return
        }

        // The DJ check runs before the public defer so its "DJ Only" refusal
        // stays ephemeral; the guild settings lookup is a primary-key read.
        if (!(await requireDJRoleInGuild(interaction, 'requireGuild'))) return

        // If the defer fails (e.g. 10062 Unknown interaction) the skip still
        // runs; interactionReply swallows the later reply failures.
        try {
            await interaction.deferReply()
        } catch (error) {
            debugLog({
                message: `Skip defer failed in guild ${interaction.guildId}, skipping anyway`,
                error,
            })
        }

        const guildId = interaction.guildId ?? ''
        // No await between the claim and node.skip(), so a concurrent /skip
        // on the same track is refused instead of skipping the next song.
        if (!claimSkip(guildId, queue.currentTrack)) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createSuccessEmbed(
                            '⏭️ Song skipped',
                            'That song was already skipped.',
                        ),
                    ],
                },
            })
            return
        }

        // Before the skip: afterwards currentTrack is the next song.
        const skippedAutoplay = captureAutoplayTrack(queue.currentTrack)

        try {
            await skipCurrentSong(queue, guildId)
            await sendSkipSuccess(interaction, queue)
        } catch (error) {
            recentSkips.delete(guildId)
            await handleSkipError(error, interaction)
            return
        }
        await promptFeedbackSafely(interaction, skippedAutoplay)
    },
})
