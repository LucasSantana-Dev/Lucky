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
        [
            '-f',
            'bestaudio/best',
            '-o',
            '-',
            '--no-warnings',
            '--quiet',
            '--no-check-certificates',
            url,
        ],
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

const tryYtDlpStream = (url: string): Promise<Readable | null> => {
    return new Promise((resolve) => {
        try {
            const stream = getYtDlpStream(url)
            let hasData = false

            const timeout = setTimeout(() => {
                if (!hasData) {
                    warnLog({
                        message: `yt-dlp timed out for ${url}, falling back to native streaming`,
                    })
                    stream.destroy()
                    resolve(null)
                }
            }, 8000)

            stream.once('data', () => {
                hasData = true
                clearTimeout(timeout)
                resolve(stream)
            })

            stream.once('error', (err) => {
                clearTimeout(timeout)
                warnLog({
                    message: `yt-dlp stream error for ${url}: ${String(err)}`,
                })
                resolve(null)
            })

            stream.once('end', () => {
                if (!hasData) {
                    clearTimeout(timeout)
                    resolve(null)
                }
            })
        } catch {
            resolve(null)
        }
    })
}

const checkYtDlpAvailability = (): Promise<boolean> => {
    return new Promise((resolve) => {
        const proc = spawn('yt-dlp', ['--version'], { stdio: 'pipe' })

        proc.on('close', (code) => resolve(code === 0))
        proc.on('error', () => resolve(false))

        setTimeout(() => {
            proc.kill()
            resolve(false)
        }, 3000)
    })
}

const loadYoutubeExtractor = async (player: Player): Promise<void> => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = (await import('discord-player-youtubei')) as any

        const ytDlpAvailable = await checkYtDlpAvailability()

        if (!ytDlpAvailable) {
            warnLog({
                message:
                    'yt-dlp not available — using native YoutubeiExtractor IOS client',
            })
        }

        const extractorOptions = ytDlpAvailable
            ? {
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
                          const stream = await tryYtDlpStream(url)
                          if (stream) return stream

                          warnLog({
                              message: `yt-dlp failed for ${url}, falling back to native IOS streaming`,
                          })
                      }

                      return url
                  },
              }
            : {
                  streamOptions: {
                      useClient: 'IOS' as const,
                      highWaterMark: 1 << 25,
                  },
              }

        await player.extractors.register(mod.YoutubeiExtractor, extractorOptions)

        infoLog({
            message: ytDlpAvailable
                ? 'Registered YoutubeiExtractor (yt-dlp primary, native IOS fallback)'
                : 'Registered YoutubeiExtractor (native IOS client)',
        })
    } catch {
        warnLog({
            message: 'YouTube extractor unavailable. Using SoundCloud/Spotify.',
        })
    }
}
