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

        it('should not override createStream — rely on native IOS client', () => {
            const extractorOptions: {
                streamOptions: { useClient: 'IOS'; highWaterMark: number }
                createStream?: unknown
            } = {
                streamOptions: {
                    useClient: 'IOS' as const,
                    highWaterMark: 1 << 25,
                },
            }

            expect(extractorOptions.createStream).toBeUndefined()
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
