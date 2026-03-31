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
}): Promise<import('stream').Readable> {
    const query = `${track.title} ${track.author}`.trim()
    const results = await playdl.search(query, {
        source: { soundcloud: 'tracks' },
        limit: 1,
    })

    if (!results.length) {
        throw new Error(`SoundCloud: no results for "${query}"`)
    }

    const scStream = await playdl.stream(results[0])
    return scStream.stream
}
