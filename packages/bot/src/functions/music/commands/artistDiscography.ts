import { QueryType } from 'discord-player'
import type { VoiceBasedChannel, ChatInputCommandInteraction } from 'discord.js'
import type { CustomClient } from '../../../types/CustomClient'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'
import { moveUserTrackToPriority } from '../../../services/musicManagement/queueManipulation'
import {
    createErrorEmbed,
    createSuccessEmbed,
} from '../../../utils/general/embeds'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    errorLog,
    warnLog,
    getSpotifyClientToken,
    searchSpotifyArtists,
    getSpotifyArtistTopTracks,
    getSpotifyArtistAlbums,
} from '@lucky/shared/utils'
import { createUserFriendlyError } from '@lucky/shared/utils/general/errorSanitizer'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { isUnknownInteractionError } from './play/queryUtils'

const MAX_DISCOGRAPHY_ALBUMS = 25
// A prolific artist's catalog can run into the hundreds of tracks once
// albums are added; this bounds queue size and worst-case resolve time.
const MAX_DISCOGRAPHY_TRACKS = 300

type ResolvedTrack = NonNullable<
    Awaited<ReturnType<CustomClient['player']['search']>>['tracks'][number]
>

async function resolveTrack(
    client: CustomClient,
    interaction: ChatInputCommandInteraction,
    url: string,
    searchEngine: QueryType,
): Promise<ResolvedTrack | null> {
    try {
        const result = await client.player.search(url, {
            requestedBy: interaction.user,
            searchEngine,
        })
        return result?.tracks[0] ?? null
    } catch (error) {
        warnLog({
            message: 'Discography track resolve failed',
            data: { url, error: String(error) },
        })
        return null
    }
}

async function resolveAlbumTracks(
    client: CustomClient,
    interaction: ChatInputCommandInteraction,
    url: string,
): Promise<ResolvedTrack[]> {
    try {
        const result = await client.player.search(url, {
            requestedBy: interaction.user,
            searchEngine: QueryType.AUTO,
        })
        return result?.tracks ?? []
    } catch (error) {
        warnLog({
            message: 'Discography album resolve failed',
            data: { url, error: String(error) },
        })
        return []
    }
}

export async function handleArtistDiscography({
    client,
    interaction,
    voiceChannel,
    artistName,
}: {
    client: CustomClient
    interaction: ChatInputCommandInteraction
    voiceChannel: VoiceBasedChannel
    artistName: string
}): Promise<void> {
    try {
        const accessToken = await getSpotifyClientToken()
        if (!accessToken) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Discography mode unavailable',
                            'Spotify credentials are not configured for this bot.',
                        ),
                    ],
                },
            })
            return
        }

        const artistMatches = await searchSpotifyArtists(
            accessToken,
            artistName,
            5,
        )
        const artistLower = artistName.toLowerCase()
        const artistMatch =
            artistMatches.find((a) => a.name.toLowerCase() === artistLower) ??
            artistMatches[0]

        if (!artistMatch) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'No results',
                            `No Spotify artist matched **${artistName}**.`,
                        ),
                    ],
                },
            })
            return
        }

        const [topTrackRefs, albums] = await Promise.all([
            getSpotifyArtistTopTracks(accessToken, artistMatch.id),
            getSpotifyArtistAlbums(
                accessToken,
                artistMatch.id,
                MAX_DISCOGRAPHY_ALBUMS,
            ),
        ])

        const [topTracksResolved, albumTrackLists] = await Promise.all([
            Promise.all(
                topTrackRefs.map((ref) =>
                    resolveTrack(
                        client,
                        interaction,
                        ref.url,
                        QueryType.SPOTIFY_SONG,
                    ),
                ),
            ),
            Promise.all(
                albums.map((album) =>
                    resolveAlbumTracks(client, interaction, album.url),
                ),
            ),
        ])

        // Top tracks first (Spotify's real popularity ranking — genuinely
        // "most famous"), then the rest of the catalog. Dedupe by
        // title+artist since the same song can surface both as a top track
        // and inside its parent album.
        const seen = new Set<string>()
        const tracks: ResolvedTrack[] = []
        const candidates = [
            ...topTracksResolved.filter((t): t is ResolvedTrack => t !== null),
            ...albumTrackLists.flat(),
        ]
        for (const track of candidates) {
            const key = `${track.title.toLowerCase().trim()}|${track.author.toLowerCase().trim()}`
            if (seen.has(key)) continue
            seen.add(key)
            tracks.push(track)
            if (tracks.length >= MAX_DISCOGRAPHY_TRACKS) break
        }

        const firstTrack = tracks[0]
        if (!firstTrack) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'No results',
                            `Could not resolve any playable tracks for **${artistMatch.name}**.`,
                        ),
                    ],
                },
            })
            return
        }

        const playResult = await client.player.play(
            voiceChannel,
            firstTrack.url,
            {
                nodeOptions: {
                    metadata: {
                        channel: interaction.channel,
                        requestedBy: interaction.user,
                    },
                    connectionTimeout:
                        ENVIRONMENT_CONFIG.PLAYER.CONNECTION_TIMEOUT,
                    leaveOnEmpty: true,
                    leaveOnEmptyCooldown: 30_000,
                    leaveOnEnd: true,
                    leaveOnEndCooldown: 300_000,
                },
                requestedBy: interaction.user,
                searchEngine: QueryType.SPOTIFY_SONG,
            },
        )

        const { queue } = resolveGuildQueue(
            client,
            interaction.guildId as string,
        )
        if (!queue) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed('Error', 'Could not create queue.'),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        for (const track of tracks.slice(1)) {
            track.requestedBy = interaction.user
            queue.addTrack(track)
        }

        if (playResult.track) {
            moveUserTrackToPriority(queue, playResult.track)
        }

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createSuccessEmbed(
                        `🎤 ${artistMatch.name} — discography`,
                        `Queued **${tracks.length}** track${tracks.length === 1 ? '' : 's'} from **${artistMatch.name}**'s catalog, most famous first. Use /skip or /stop whenever you've had enough.`,
                    ),
                ],
            },
        })
    } catch (error) {
        if (isUnknownInteractionError(error)) return
        errorLog({
            message: 'Artist discography command error:',
            error,
            data: { artistName, guildId: interaction.guildId },
        })
        try {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Error',
                            createUserFriendlyError(error),
                        ),
                    ],
                    ephemeral: true,
                },
            })
        } catch {
            // interaction already replied
        }
    }
}
