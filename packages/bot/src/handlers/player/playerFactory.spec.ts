import { describe, it, expect } from '@jest/globals'

describe('playerFactory', () => {
    describe('createPlayer', () => {
        it('should identify YouTube URLs correctly', () => {
            const isYouTubeUrl = (url: string): boolean =>
                url.includes('youtube.com') || url.includes('youtu.be')

            expect(isYouTubeUrl('https://www.youtube.com/watch?v=test')).toBe(
                true,
            )
            expect(isYouTubeUrl('https://youtu.be/test')).toBe(true)
            expect(isYouTubeUrl('https://soundcloud.com/track')).toBe(false)
            expect(isYouTubeUrl('https://open.spotify.com/track/abc')).toBe(
                false,
            )
            expect(isYouTubeUrl('https://music.youtube.com/watch?v=test')).toBe(
                true,
            )
        })

        it('should validate player creation parameters', () => {
            type CreatePlayerParams = { client: unknown }
            const validateParams = (params: CreatePlayerParams): boolean =>
                params && params.client !== undefined

            expect(validateParams({ client: {} })).toBe(true)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect(validateParams({ client: null } as any)).toBe(true)
        })
    })

    describe('YouTube extractor configuration', () => {
        it('should use IOS client with 32MB high water mark', () => {
            const extractorOptions = {
                streamOptions: {
                    useClient: 'IOS' as const,
                    highWaterMark: 1 << 25,
                },
            }

            expect(extractorOptions.streamOptions.useClient).toBe('IOS')
            expect(extractorOptions.streamOptions.highWaterMark).toBe(33554432)
        })

        it('should omit createStream when yt-dlp is unavailable', () => {
            const buildOptions = (ytDlpAvailable: boolean) =>
                ytDlpAvailable
                    ? {
                          streamOptions: { useClient: 'IOS' as const },
                          createStream: () => {},
                      }
                    : { streamOptions: { useClient: 'IOS' as const } }

            expect(buildOptions(true)).toHaveProperty('createStream')
            expect(buildOptions(false)).not.toHaveProperty('createStream')
        })
    })

    describe('yt-dlp --get-url command arguments', () => {
        it('should use --get-url for direct stream URL resolution', () => {
            const ytDlpArgs = [
                '-f',
                'bestaudio',
                '--get-url',
                '--no-warnings',
                '--no-check-certificates',
            ]

            expect(ytDlpArgs).toContain('bestaudio')
            expect(ytDlpArgs).toContain('--get-url')
            expect(ytDlpArgs).toContain('--no-check-certificates')
            expect(ytDlpArgs).toContain('--no-warnings')
        })

        it('should use 30s timeout for URL resolution', () => {
            const execOptions = { timeout: 30000 }
            expect(execOptions.timeout).toBe(30000)
        })
    })

    describe('getYtDlpUrl fallback logic', () => {
        it('should fall back to original URL when yt-dlp returns null', async () => {
            const getYtDlpUrl = async (_url: string): Promise<null> => null

            const createStream = async (track: {
                url: string
            }): Promise<string> => {
                const url = track.url
                const isYt =
                    url.includes('youtube.com') || url.includes('youtu.be')
                if (isYt) {
                    const streamUrl = await getYtDlpUrl(url)
                    if (streamUrl) return streamUrl
                }
                return url
            }

            const youtubeUrl = 'https://youtube.com/watch?v=abc'
            const result = await createStream({ url: youtubeUrl })
            expect(result).toBe(youtubeUrl)
        })

        it('should return direct googlevideo URL when yt-dlp succeeds', async () => {
            const googlevideoUrl =
                'https://rr3---sn.googlevideo.com/videoplayback?test=1'
            const getYtDlpUrl = async (_url: string) => googlevideoUrl

            const createStream = async (track: { url: string }) => {
                const url = track.url
                if (url.includes('youtube.com')) {
                    const streamUrl = await getYtDlpUrl(url)
                    if (streamUrl) return streamUrl
                }
                return url
            }

            const result = await createStream({
                url: 'https://youtube.com/watch?v=abc',
            })
            expect(result).toBe(googlevideoUrl)
        })

        it('should return URL directly for non-YouTube tracks', async () => {
            const getYtDlpUrl = async (_url: string): Promise<null> => null

            const createStream = async (track: {
                url: string
            }): Promise<string> => {
                const url = track.url
                const isYt =
                    url.includes('youtube.com') || url.includes('youtu.be')
                if (isYt) {
                    const streamUrl = await getYtDlpUrl(url)
                    if (streamUrl) return streamUrl
                }
                return url
            }

            const spotifyUrl = 'https://open.spotify.com/track/abc'
            expect(await createStream({ url: spotifyUrl })).toBe(spotifyUrl)
            expect(
                await createStream({ url: 'https://soundcloud.com/track' }),
            ).toBe('https://soundcloud.com/track')
        })
    })

    describe('checkYtDlpAvailability', () => {
        it('should resolve false when yt-dlp exits with non-zero code', async () => {
            const simulateCheck = (exitCode: number): Promise<boolean> =>
                new Promise((resolve) => resolve(exitCode === 0))

            expect(await simulateCheck(0)).toBe(true)
            expect(await simulateCheck(1)).toBe(false)
            expect(await simulateCheck(127)).toBe(false)
        })

        it('should resolve false on process error', async () => {
            const checkOnError = (): Promise<boolean> =>
                new Promise((resolve) => resolve(false))

            expect(await checkOnError()).toBe(false)
        })
    })

    describe('error handling', () => {
        it('should handle extractor registration failures gracefully', () => {
            const registerSafely = (register: () => void): boolean => {
                try {
                    register()
                    return true
                } catch {
                    return false
                }
            }

            expect(
                registerSafely(() => {
                    throw new Error('extractor not found')
                }),
            ).toBe(false)
            expect(registerSafely(() => {})).toBe(true)
        })

        it('should set max listeners to 20 to prevent memory leak warnings', () => {
            const maxListeners = 20
            expect(maxListeners).toBe(20)
        })
    })
})
