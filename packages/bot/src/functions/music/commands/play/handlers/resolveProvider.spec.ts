import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { QueryType } from 'discord-player'
import type { VoiceChannel } from 'discord.js'

const warnLogMock = jest.fn()
const addBreadcrumbMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    warnLog: warnLogMock,
}))

jest.mock('@lucky/shared/utils/monitoring', () => ({
    addBreadcrumb: addBreadcrumbMock,
}))

import {
    resolveQueryWithFallbacks,
    emitPlayResolutionTelemetry,
} from './resolveProvider'

describe('resolveQueryWithFallbacks', () => {
    let mockPlayer: any
    let mockVoiceChannel: any
    let mockPlayOptions: any

    beforeEach(() => {
        jest.clearAllMocks()

        mockVoiceChannel = {
            id: 'vc-1',
            members: new Map(),
        } as unknown as VoiceChannel

        mockPlayOptions = {
            searchEngine: QueryType.AUTO,
        }

        mockPlayer = {
            play: jest.fn(),
        }
    })

    describe('primary resolution success', () => {
        it('should resolve successfully on primary attempt', async () => {
            const mockTrack = { title: 'Test Song' }
            mockPlayer.play.mockResolvedValue(mockTrack)

            const { result, telemetry } = await resolveQueryWithFallbacks(
                mockPlayer,
                mockVoiceChannel,
                'test query',
                'default',
                QueryType.AUTO,
                mockPlayOptions,
            )

            expect(result).toEqual(mockTrack)
            expect(telemetry.resolvedVia).toBe('primary')
            expect(telemetry.requestedProvider).toBe('default')
            expect(telemetry.latencyMs).toBeGreaterThanOrEqual(0)
            expect(telemetry.errorClass).toBeUndefined()
        })
    })

    describe('fallback resolution', () => {
        it('should fallback to YouTube when primary fails and provider is specified', async () => {
            const primaryError = new Error('Primary failed')
            const mockTrack = { title: 'Test Song' }

            mockPlayer.play
                .mockRejectedValueOnce(primaryError)
                .mockResolvedValueOnce(mockTrack)

            const { result, telemetry } = await resolveQueryWithFallbacks(
                mockPlayer,
                mockVoiceChannel,
                'test query',
                'youtube',
                QueryType.YOUTUBE_SEARCH,
                mockPlayOptions,
            )

            expect(result).toEqual(mockTrack)
            expect(telemetry.resolvedVia).toBe('youtube-fallback')
            expect(warnLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Primary search failed, falling back to YouTube',
                }),
            )
        })

        it('should fallback to SoundCloud when YouTube also fails', async () => {
            const primaryError = new Error('Primary failed')
            const youtubeError = new Error('YouTube failed')
            const mockTrack = { title: 'Test Song' }

            mockPlayer.play
                .mockRejectedValueOnce(primaryError)
                .mockRejectedValueOnce(youtubeError)
                .mockResolvedValueOnce(mockTrack)

            const { result, telemetry } = await resolveQueryWithFallbacks(
                mockPlayer,
                mockVoiceChannel,
                'test query',
                'soundcloud',
                QueryType.SOUNDCLOUD_SEARCH,
                mockPlayOptions,
            )

            expect(result).toEqual(mockTrack)
            expect(telemetry.resolvedVia).toBe('soundcloud-fallback')
            expect(warnLogMock).toHaveBeenCalledTimes(2)
        })
    })

    describe('failure handling', () => {
        it('should include error class when all attempts fail', async () => {
            class CustomError extends Error {
                constructor() {
                    super('Custom failure')
                    this.name = 'CustomError'
                }
            }

            mockPlayer.play
                .mockRejectedValueOnce(new CustomError())
                .mockRejectedValueOnce(new CustomError())
                .mockRejectedValueOnce(new CustomError())

            try {
                await resolveQueryWithFallbacks(
                    mockPlayer,
                    mockVoiceChannel,
                    'test query',
                    'soundcloud',
                    QueryType.SOUNDCLOUD_SEARCH,
                    mockPlayOptions,
                )
            } catch (e) {
                expect(e).toBeInstanceOf(CustomError)
            }
        })

        it('should throw immediately when AUTO searchEngine and primary fails', async () => {
            const primaryError = new Error('Primary failed')
            mockPlayer.play.mockRejectedValueOnce(primaryError)

            await expect(
                resolveQueryWithFallbacks(
                    mockPlayer,
                    mockVoiceChannel,
                    'test query',
                    'default',
                    QueryType.AUTO,
                    mockPlayOptions,
                ),
            ).rejects.toThrow('Primary failed')

            expect(warnLogMock).not.toHaveBeenCalled()
        })
    })

    describe('latency measurement', () => {
        it('should measure latency accurately', async () => {
            const mockTrack = { title: 'Test Song' }
            mockPlayer.play.mockImplementation(
                () =>
                    new Promise((resolve) => {
                        setTimeout(() => resolve(mockTrack), 50)
                    }),
            )

            const { telemetry } = await resolveQueryWithFallbacks(
                mockPlayer,
                mockVoiceChannel,
                'test query',
                'default',
                QueryType.AUTO,
                mockPlayOptions,
            )

            expect(telemetry.latencyMs).toBeGreaterThanOrEqual(50)
        })
    })
})

describe('emitPlayResolutionTelemetry', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should emit breadcrumb with all telemetry data', () => {
        const telemetry = {
            resolvedVia: 'primary' as const,
            latencyMs: 123,
            requestedProvider: 'youtube',
        }

        emitPlayResolutionTelemetry(telemetry)

        expect(addBreadcrumbMock).toHaveBeenCalledWith(
            expect.stringContaining('play_provider_resolution'),
            'play',
            'info',
            expect.objectContaining({
                requestedProvider: 'youtube',
                resolvedVia: 'primary',
                latencyMs: 123,
            }),
        )
    })

    it('should include errorClass when present', () => {
        const telemetry = {
            resolvedVia: 'failed' as const,
            latencyMs: 200,
            requestedProvider: 'default',
            errorClass: 'CustomError',
        }

        emitPlayResolutionTelemetry(telemetry)

        expect(addBreadcrumbMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.anything(),
            expect.objectContaining({
                errorClass: 'CustomError',
            }),
        )
    })

    it('should not throw when addBreadcrumb throws', () => {
        addBreadcrumbMock.mockImplementationOnce(() => {
            throw new Error('Telemetry error')
        })

        const telemetry = {
            resolvedVia: 'primary' as const,
            latencyMs: 100,
            requestedProvider: 'default',
        }

        // Should not throw
        expect(() => emitPlayResolutionTelemetry(telemetry)).not.toThrow()
    })

    it('should not include errorClass key when undefined', () => {
        const telemetry = {
            resolvedVia: 'primary' as const,
            latencyMs: 100,
            requestedProvider: 'default',
            errorClass: undefined,
        }

        emitPlayResolutionTelemetry(telemetry)

        const callArgs = addBreadcrumbMock.mock.calls[0][3]
        expect(callArgs).not.toHaveProperty('errorClass')
    })
})
