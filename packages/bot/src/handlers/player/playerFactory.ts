import { execFile } from 'child_process'
import { promisify } from 'util'
import { Player } from 'discord-player'
import { DefaultExtractors } from '@discord-player/extractor'
import type { CustomClient } from '../../types'
import { errorLog, infoLog, warnLog, debugLog } from '@nexus/shared/utils'

const execFileAsync = promisify(execFile)

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

const getYtDlpStreamUrl = async (url: string): Promise<string> => {
    debugLog({ message: `yt-dlp resolving stream URL: ${url}` })
    const { stdout } = await execFileAsync(
        'yt-dlp',
        ['-f', 'bestaudio', '--get-url', '--no-warnings', url],
        { timeout: 30_000 },
    )
    const streamUrl = stdout.trim()
    debugLog({ message: `yt-dlp resolved: ${streamUrl.slice(0, 80)}...` })
    return streamUrl
}

const loadYoutubeExtractor = async (player: Player): Promise<void> => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = (await import('discord-player-youtubei')) as any
        const extractorOptions = {
            streamOptions: { useClient: 'ANDROID' as const },
            createStream: async (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                track: any,
            ): Promise<string> => {
                const url = track?.url ?? String(track)
                debugLog({ message: `createStream for: ${url}` })
                if (isYouTubeUrl(url)) {
                    return getYtDlpStreamUrl(url)
                }
                return url
            },
        }
        await player.extractors.register(
            mod.YoutubeiExtractor,
            extractorOptions,
        )
        infoLog({
            message: 'Registered YoutubeiExtractor (YouTube via yt-dlp)',
        })
    } catch {
        warnLog({
            message: 'YouTube extractor unavailable. Using SoundCloud/Spotify.',
        })
    }
}
