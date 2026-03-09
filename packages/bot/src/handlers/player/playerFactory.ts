import { spawn } from 'child_process'
import type { Readable } from 'stream'
import { Player } from 'discord-player'
import { DefaultExtractors } from '@discord-player/extractor'
import type { CustomClient } from '../../types'
import { errorLog, infoLog, warnLog, debugLog } from '@lucky/shared/utils'

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

const isYouTubeUrl = (url: string): boolean =>
    url.includes('youtube.com') || url.includes('youtu.be')

const getYtDlpStream = (url: string): Readable => {
    debugLog({ message: `yt-dlp piping audio stream: ${url}` })
    const proc = spawn(
        'yt-dlp',
        ['-f', 'bestaudio', '-o', '-', '--no-warnings', '--quiet', url],
        { stdio: ['ignore', 'pipe', 'pipe'] },
    )

    proc.stderr?.on('data', (data: Buffer) => {
        warnLog({ message: `yt-dlp stderr: ${data.toString().trim()}` })
    })

    proc.on('error', (err) => {
        errorLog({ message: 'yt-dlp process error:', error: err })
    })

    return proc.stdout as Readable
}

const loadYoutubeExtractor = async (player: Player): Promise<void> => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = (await import('discord-player-youtubei')) as any
        const extractorOptions = {
            streamOptions: {
                useClient: 'IOS' as const,
                highWaterMark: 1 << 25,
            },
            createStream: async (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                track: any,
            ): Promise<Readable | string> => {
                const url = track?.url ?? String(track)
                debugLog({ message: `createStream for: ${url}` })
                if (isYouTubeUrl(url)) {
                    return getYtDlpStream(url)
                }
                return url
            },
        }
        await player.extractors.register(
            mod.YoutubeiExtractor,
            extractorOptions,
        )
        infoLog({
            message: 'Registered YoutubeiExtractor (YouTube via yt-dlp pipe)',
        })
    } catch {
        warnLog({
            message: 'YouTube extractor unavailable. Using SoundCloud/Spotify.',
        })
    }
}
