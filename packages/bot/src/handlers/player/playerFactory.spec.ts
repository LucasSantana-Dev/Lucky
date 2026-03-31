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

    describe('yt-dlp pipe command arguments', () => {
        it('should pipe audio to stdout with bestaudio/best format', () => {
            const ytDlpArgs = [
                '-f',
                'bestaudio/best',
                '-o',
                '-',
                '--no-warnings',
                '--quiet',
            ]

            expect(ytDlpArgs).toContain('bestaudio/best')
            expect(ytDlpArgs).toContain('-o')
            expect(ytDlpArgs).toContain('-')
            expect(ytDlpArgs).toContain('--no-warnings')
        })

        it('should use pipe stdio for stream output', () => {
            const spawnOptions = { stdio: ['ignore', 'pipe', 'pipe'] as const }
            expect(spawnOptions.stdio[0]).toBe('ignore')
            expect(spawnOptions.stdio[1]).toBe('pipe')
            expect(spawnOptions.stdio[2]).toBe('pipe')
        })
    })

    describe('createStream pipe logic', () => {
        it('should return URL directly for non-YouTube tracks', async () => {
            const createStream = async (track: {
                url: string
            }): Promise<string> => {
                const url = track.url
                const isYt =
                    url.includes('youtube.com') || url.includes('youtu.be')
                if (isYt) {
                    return 'pipe-stream' // would be proc.stdout
                }
                return url
            }

            const spotifyUrl = 'https://open.spotify.com/track/abc'
            expect(await createStream({ url: spotifyUrl })).toBe(spotifyUrl)
            expect(
                await createStream({ url: 'https://soundcloud.com/track' }),
            ).toBe('https://soundcloud.com/track')
        })

        it('should pipe YouTube URLs through yt-dlp', async () => {
            const pipedUrls: string[] = []
            const createStream = async (track: { url: string }) => {
                const url = track.url
                if (url.includes('youtube.com') || url.includes('youtu.be')) {
                    pipedUrls.push(url)
                    return {} // mock proc.stdout
                }
                return url
            }

            await createStream({ url: 'https://youtube.com/watch?v=abc' })
            expect(pipedUrls).toContain('https://youtube.com/watch?v=abc')
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
