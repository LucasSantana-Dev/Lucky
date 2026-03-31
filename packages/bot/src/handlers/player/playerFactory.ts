import { Player } from 'discord-player'
import { DefaultExtractors } from '@discord-player/extractor'
import * as playdl from 'play-dl'
import type { CustomClient } from '../../types'
import { errorLog, infoLog, warnLog } from '@lucky/shared/utils'

type CreatePlayerParams = {
    client: CustomClient
}

export const createPlayer = ({ client }: CreatePlayerParams): Player => {
    try {
        infoLog({ message: 'Creating player...' })

        const player = new Player(client)
        registerExtractors(player)

        player.setMaxListeners(20)

        infoLog({ message: 'Player created successfully' })
        return player
    } catch (error) {
        errorLog({ message: 'Error creating player:', error })
        throw error
    }
}

const registerExtractors = (player: Player): void => {
    void player.extractors.loadMulti(DefaultExtractors)

    void loadYoutubeExtractor(player)

    infoLog({
        message:
            'Extractors: SoundCloud, Spotify, Apple Music, Vimeo, Attachments',
    })
}

const loadYoutubeExtractor = async (player: Player): Promise<void> => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = (await import('discord-player-youtubei')) as any

        const registered = await player.extractors.register(
            mod.YoutubeiExtractor,
            {
                streamOptions: {
                    useClient: 'IOS' as const,
                    highWaterMark: 1 << 25,
                },
                generateWithPoToken: true,
                createStream: streamViaSoundCloud,
            },
        )

        if (!registered) {
            warnLog({
                message:
                    'YoutubeiExtractor registration returned null — activation may have failed',
            })
            return
        }

        infoLog({
            message: 'Registered YoutubeiExtractor (SoundCloud stream bridge)',
        })
    } catch {
        warnLog({
            message: 'YouTube extractor unavailable. Using SoundCloud/Spotify.',
        })
    }
}

async function streamViaSoundCloud(track: {
    title: string
    author: string
    duration?: string
}): Promise<import('stream').Readable> {
    const query = `${track.title} ${track.author}`.trim()
    const results = await playdl.search(query, {
        source: { soundcloud: 'tracks' },
        limit: 5,
    })

    if (!results.length) {
        throw new Error(`SoundCloud: no results for "${query}"`)
    }

    const norm = (s: string) =>
        s
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .trim()
    const titleNorm = norm(track.title)
    const trackSec = parseDurationString(track.duration)

    const match = results.find((r) => {
        const titleMatch =
            norm(r.name).includes(titleNorm) || titleNorm.includes(norm(r.name))
        if (!titleMatch) return false
        if (trackSec === null || !r.durationInSec) return true
        return Math.abs(r.durationInSec - trackSec) <= 15
    })

    if (!match) {
        throw new Error(
            `SoundCloud: no validated match for "${query}" (title/duration mismatch)`,
        )
    }

    const scStream = await playdl.stream(match)
    return scStream.stream
}

function parseDurationString(duration?: string): number | null {
    if (!duration) return null
    const parts = duration.split(':').map(Number)
    if (parts.some(isNaN)) return null
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return null
}
