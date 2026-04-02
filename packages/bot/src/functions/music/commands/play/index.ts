import { SlashCommandBuilder } from '@discordjs/builders'
import type { GuildMember, ChatInputCommandInteraction } from 'discord.js'
import { requireVoiceChannel } from '../../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../../types/CommandData'
import type { CustomClient } from '../../../../types'
import Command from '../../../../models/Command'
import { errorLog, debugLog, warnLog } from '@lucky/shared/utils'
import { guildSettingsService } from '@lucky/shared/services'
import { createErrorEmbed } from '../../../../utils/general/embeds'
import { createSuccessEmbed } from '../../../../utils/general/embeds'
import { collaborativePlaylistService } from '../../../../utils/music/collaborativePlaylist'
import { QueueRepeatMode } from 'discord-player'
import { resolveGuildQueue } from '../../../../utils/music/queueResolver'
import {
    moveUserTrackToPriority,
    blendAutoplayTracks,
} from '../../../../utils/music/queueManipulation'

const DISCORD_UNKNOWN_INTERACTION_CODE = 10062

function isTrackAlreadyQueued(
    queue: { tracks: { toArray?: () => Array<{ id?: string; url?: string }> } },
    track: { id?: string; url?: string },
): boolean {
    const queuedTracks = queue.tracks.toArray?.() ?? []

    return queuedTracks.some((queuedTrack) => {
        if (track.id && queuedTrack.id === track.id) return true
        if (track.url && queuedTrack.url === track.url) return true
        return queuedTrack === track
    })
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription(
            'Play music from YouTube, Spotify, or search for tracks',
        )
        .addStringOption((option) =>
            option
                .setName('query')
                .setDescription(
                    'Song name, artist, YouTube URL, or Spotify URL',
                )
                .setRequired(true),
        ),
    category: 'music',
    execute: async ({
        client,
        interaction,
    }: CommandExecuteParams): Promise<void> => {
        if (!interaction.guildId) {
            await interaction.reply({
                embeds: [
                    createErrorEmbed(
                        'Error',
                        'This command can only be used in a server',
                    ),
                ],
                ephemeral: true,
            })
            return
        }

        const member = interaction.member as GuildMember
        if (!(await requireVoiceChannel(interaction))) return

        const voiceChannel = member.voice.channel!

        await interaction.deferReply()

        const query = interaction.options.getString('query', true)
        const collaborativeCheck = collaborativePlaylistService.canAddTracks(
            interaction.guildId,
            interaction.user.id,
            1,
        )
        if (!collaborativeCheck.allowed) {
            await interaction.editReply({
                embeds: [
                    createErrorEmbed(
                        'Contribution limit reached',
                        `Collaborative mode limit reached (${collaborativeCheck.limit} track requests per user).`,
                    ),
                ],
            })
            return
        }

        try {
            const result = await client.player.play(voiceChannel, query, {
                nodeOptions: {
                    metadata: {
                        channel: interaction.channel,
                        requestedBy: interaction.user,
                    },
                    leaveOnEmpty: true,
                    leaveOnEmptyCooldown: 30_000,
                    leaveOnEnd: true,
                    leaveOnEndCooldown: 300_000,
                },
                requestedBy: interaction.user,
            })

            const track = result.track

            const isPlaylist = !!result.searchResult.playlist
            const { queue } = resolveGuildQueue(
                client,
                interaction.guildId ?? '',
            )

            if (queue) {
                await applyStoredAutoplayPreference(
                    queue,
                    interaction.guildId,
                )
            }

            if (!isPlaylist && queue) {
                if (!isTrackAlreadyQueued(queue, track)) {
                    moveUserTrackToPriority(queue, track)
                }
                if (queue.repeatMode === QueueRepeatMode.AUTOPLAY) {
                    await blendAutoplayTracks(queue, track)
                }
            }

            const embed = result.searchResult.playlist
                ? createSuccessEmbed(
                      'Playlist Enqueued',
                      `**${result.searchResult.playlist.title}** — ${result.searchResult.tracks.length} tracks`,
                  )
                : createSuccessEmbed(
                      'Now Playing',
                      `**${track.title}** by ${track.author}`,
                  )

            collaborativePlaylistService.recordContribution(
                interaction.guildId,
                interaction.user.id,
                1,
            )

            await interaction.editReply({ embeds: [embed] })
        } catch (error) {
            errorLog({
                message: 'Play command error:',
                error,
                data: { query, guildId: interaction.guildId },
            })

            const code = (error as { code?: number })?.code
            if (code === DISCORD_UNKNOWN_INTERACTION_CODE) return

            try {
                await interaction.editReply({
                    embeds: [
                        createErrorEmbed(
                            'Play Error',
                            'Could not find or play the requested track',
                        ),
                    ],
                })
            } catch (replyError) {
                warnLog({
                    message: 'Failed to send play command error reply',
                    error: replyError,
                    data: { guildId: interaction.guildId },
                })
            }
        }
    },
})

async function applyStoredAutoplayPreference(
    queue: {
        repeatMode: QueueRepeatMode
        setRepeatMode: (mode: QueueRepeatMode) => void
    },
    guildId: string,
): Promise<void> {
    try {
        const settings = await guildSettingsService.getGuildSettings(guildId)
        if (typeof settings?.autoPlayEnabled === 'boolean') {
            const repeatMode = settings.autoPlayEnabled
                ? QueueRepeatMode.AUTOPLAY
                : QueueRepeatMode.OFF

            if (queue.repeatMode !== repeatMode) {
                queue.setRepeatMode(repeatMode)
            }

            debugLog({
                message: 'Applied stored autoplay preference to queue',
                data: { guildId, autoPlayEnabled: settings.autoPlayEnabled },
            })
        }
    } catch (error) {
        warnLog({
            message: 'Failed to apply stored autoplay preference',
            error,
            data: { guildId },
        })
    }
}
