import type { ChatInputCommandInteraction, VoiceBasedChannel } from 'discord.js'
import { getSpotifyArtist, getSpotifyClientToken } from '@lucky/shared/utils'
import type { CustomClient } from '../../../../../types/CustomClient'
import { createErrorEmbed } from '../../../../../utils/general/embeds'
import { interactionReply } from '../../../../../utils/general/interactionReply'
import { queueArtistTopTracks } from '../../artist'
import type { CollaborativeReservation } from './collaborativeLimit'

/**
 * The artist id of an open.spotify.com artist link, with or without an
 * `intl-xx` locale segment, or null for anything else. discord-player's
 * Spotify extractor only accepts track, album and playlist links, so an
 * artist link would otherwise reach AttachmentExtractor and fail (#3274).
 */
export function spotifyArtistId(query: string): string | null {
    let url: URL
    try {
        url = new URL(query.trim())
    } catch {
        return null
    }
    if (url.hostname.toLowerCase() !== 'open.spotify.com') return null
    const match = /^\/(?:intl-[a-z-]+\/)?artist\/([A-Za-z0-9]+)\/?$/i.exec(
        url.pathname,
    )
    return match ? match[1] : null
}

async function replyArtistLinkError(
    interaction: ChatInputCommandInteraction,
    message: string,
): Promise<void> {
    await interactionReply({
        interaction,
        content: { embeds: [createErrorEmbed('Spotify artist', message)] },
    })
}

/**
 * Queues an artist's top tracks for a Spotify artist link, through the same
 * flow as `/artist <name>`. The reply must already be deferred.
 */
export async function playSpotifyArtistLink({
    client,
    interaction,
    voiceChannel,
    artistId,
    reservation,
}: {
    client: CustomClient
    interaction: ChatInputCommandInteraction
    voiceChannel: VoiceBasedChannel
    artistId: string
    reservation?: CollaborativeReservation
}): Promise<void> {
    const accessToken = await getSpotifyClientToken()
    if (!accessToken) {
        await replyArtistLinkError(
            interaction,
            'Spotify artist links are not available on this bot. Try `/artist` with the artist name.',
        )
        return
    }

    const artist = await getSpotifyArtist(accessToken, artistId)
    if (!artist) {
        await replyArtistLinkError(
            interaction,
            'Could not find that Spotify artist. Try `/artist` with the artist name.',
        )
        return
    }

    await queueArtistTopTracks({
        client,
        interaction,
        voiceChannel,
        artistName: artist.name,
        reservation,
    })
}
