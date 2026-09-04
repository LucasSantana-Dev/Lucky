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
    preferExactMatch,
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

        it('should block SpotifyExtractor in YouTube fallback so it cannot intercept text queries', async () => {
            const primaryError = new Error(
                'No results found (Spotify extractor)',
            )
            const mockTrack = { title: 'Test Song' }

            mockPlayer.play
                .mockRejectedValueOnce(primaryError)
                .mockResolvedValueOnce(mockTrack)

            await resolveQueryWithFallbacks(
                mockPlayer,
                mockVoiceChannel,
                'pink floyd wish you were here',
                'spotify',
                QueryType.SPOTIFY_SEARCH,
                mockPlayOptions,
            )

            const youtubeFallbackCall = mockPlayer.play.mock.calls[1]
            expect(youtubeFallbackCall[2]).toMatchObject({
                searchEngine: QueryType.YOUTUBE_SEARCH,
                // Both of these claim plain text queries via a permissive
                // validate(). AttachmentExtractor swallowing this arm is what
                // made every fallback report itself as the attachment
                // extractor in production (#1930).
                blockExtractors: expect.arrayContaining([
                    'com.discord-player.itsmaat.spotifyextractor',
                    'com.discord-player.attachmentextractor',
                ]),
            })
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

        it('should block SpotifyExtractor in SoundCloud fallback so it cannot intercept text queries', async () => {
            const primaryError = new Error(
                'No results found (Spotify extractor)',
            )
            const youtubeError = new Error('YouTube failed')
            const mockTrack = { title: 'Test Song' }

            mockPlayer.play
                .mockRejectedValueOnce(primaryError)
                .mockRejectedValueOnce(youtubeError)
                .mockResolvedValueOnce(mockTrack)

            await resolveQueryWithFallbacks(
                mockPlayer,
                mockVoiceChannel,
                'pink floyd wish you were here',
                'spotify',
                QueryType.SPOTIFY_SEARCH,
                mockPlayOptions,
            )

            const soundcloudFallbackCall = mockPlayer.play.mock.calls[2]
            expect(soundcloudFallbackCall[2]).toMatchObject({
                searchEngine: QueryType.SOUNDCLOUD_SEARCH,
                blockExtractors: expect.arrayContaining([
                    'com.discord-player.itsmaat.spotifyextractor',
                    'com.discord-player.attachmentextractor',
                ]),
            })
        })

        it('never lets a text-search arm reach an extractor that cannot search', async () => {
            const mockTrack = { title: 'Test Song' }
            mockPlayer.play
                .mockRejectedValueOnce(new Error('Primary failed'))
                .mockRejectedValueOnce(new Error('YouTube failed'))
                .mockResolvedValueOnce({ track: mockTrack })

            await resolveQueryWithFallbacks(
                mockPlayer as never,
                mockVoiceChannel as never,
                'chico preto jurandyr',
                'spotify',
                QueryType.SPOTIFY_SEARCH,
                mockPlayOptions,
            )

            // Arms 2 and 3 are the text-search fallbacks. Neither may leave
            // AttachmentExtractor unblocked: it accepts the query, cannot
            // serve it, and then masks which provider actually failed.
            for (const call of mockPlayer.play.mock.calls.slice(1)) {
                expect(call[2].blockExtractors).toContain(
                    'com.discord-player.attachmentextractor',
                )
            }
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

            expect(telemetry.latencyMs).toBeGreaterThanOrEqual(40)
        })
    })

    describe('search relevance', () => {
        it('passes an afterSearch reranker through on every arm', async () => {
            const mockTrack = { title: 'Test Song' }
            mockPlayer.play
                .mockRejectedValueOnce(new Error('Primary failed'))
                .mockRejectedValueOnce(new Error('YouTube failed'))
                .mockResolvedValueOnce(mockTrack)

            await resolveQueryWithFallbacks(
                mockPlayer,
                mockVoiceChannel,
                'Prince',
                'spotify',
                QueryType.SPOTIFY_SEARCH,
                mockPlayOptions,
            )

            for (const call of mockPlayer.play.mock.calls) {
                expect(call[2].afterSearch).toEqual(expect.any(Function))
            }
        })
    })
})

function makeMockTrack(title: string, author: string) {
    return { title, author, metadata: null, setMetadata: jest.fn() }
}

describe('preferExactMatch', () => {
    it('promotes a track whose author exactly matches the query', async () => {
        const tracks = [
            makeMockTrack('Adicto', 'Prince Royce'),
            makeMockTrack('Purple Rain', 'Prince'),
        ]
        const result = {
            hasPlaylist: () => false,
            tracks,
            setTracks: jest.fn(() => result),
        }

        await preferExactMatch('Prince')(result as any)

        for (const track of tracks) {
            expect(track.setMetadata).toHaveBeenCalledWith({
                requestedQuery: 'Prince',
            })
        }
        expect(result.setTracks).toHaveBeenCalledWith([tracks[1], tracks[0]])
    })

    it.each([
        ['https://open.spotify.com/track/abc123'],
        ['HTTP://open.spotify.com/track/abc123'],
        ['  https://open.spotify.com/track/abc123'],
    ])('does not stamp requestedQuery for a URL query: %s', async (query) => {
        const tracks = [makeMockTrack('Adicto', 'Prince Royce')]
        const result = {
            hasPlaylist: () => false,
            tracks,
            setTracks: jest.fn(() => result),
        }

        await preferExactMatch(query)(result as any)

        expect(tracks[0].setMetadata).not.toHaveBeenCalled()
    })

    it('promotes a track whose title exactly matches the query', async () => {
        const tracks = [
            makeMockTrack('Some Other Song', 'Someone Else'),
            makeMockTrack('prince', 'A Tribute Band'),
        ]
        const result = {
            hasPlaylist: () => false,
            tracks,
            setTracks: jest.fn(() => result),
        }

        await preferExactMatch('Prince')(result as any)

        expect(result.setTracks).toHaveBeenCalledWith([tracks[1], tracks[0]])
    })

    it('leaves the result untouched when no exact match exists', async () => {
        const tracks = [
            makeMockTrack('Bohemian Rhapsody', 'Queen'),
            makeMockTrack('Somebody to Love', 'Queen'),
        ]
        const result = {
            hasPlaylist: () => false,
            tracks,
            setTracks: jest.fn(() => result),
        }

        const returned = await preferExactMatch('bohemian rhapsody queen')(
            result as any,
        )

        expect(result.setTracks).not.toHaveBeenCalled()
        expect(returned).toBe(result)
    })

    it('leaves the result untouched when the exact match is already first', async () => {
        const tracks = [
            makeMockTrack('Purple Rain', 'Prince'),
            makeMockTrack('Adicto', 'Prince Royce'),
        ]
        const result = {
            hasPlaylist: () => false,
            tracks,
            setTracks: jest.fn(() => result),
        }

        await preferExactMatch('Prince')(result as any)

        expect(result.setTracks).not.toHaveBeenCalled()
    })

    it('skips reordering for playlist results but still stamps requestedQuery', async () => {
        const tracks = [
            makeMockTrack('Adicto', 'Prince Royce'),
            makeMockTrack('Purple Rain', 'Prince'),
        ]
        const result = {
            hasPlaylist: () => true,
            tracks,
            setTracks: jest.fn(() => result),
        }

        await preferExactMatch('Prince')(result as any)

        expect(result.setTracks).not.toHaveBeenCalled()
        for (const track of tracks) {
            expect(track.setMetadata).toHaveBeenCalledWith({
                requestedQuery: 'Prince',
            })
        }
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
