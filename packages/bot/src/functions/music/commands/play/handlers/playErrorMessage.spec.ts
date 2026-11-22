const isExtractorDegradedMock = jest.fn(() => false)

const errorLogMock = jest.fn()
const warnLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

jest.mock('../../../../../handlers/player/extractorHealth', () => ({
    isExtractorDegraded: (
        ...args: Parameters<typeof isExtractorDegradedMock>
    ) => isExtractorDegradedMock(...args),
}))

import {
    classifyPlayFailure,
    logPlayFailure,
    resolvePlayErrorMessage,
} from './playErrorMessage'
import {
    YoutubePlaylistUnavailableError,
    YoutubeVideoUnavailableError,
} from './youtubeLinkErrors'
import { AsmrBlockedError } from '../../../../../utils/music/asmrFilter'

describe('resolvePlayErrorMessage', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        isExtractorDegradedMock.mockReturnValue(false)
    })

    it('reports sources unreachable for a no-results error while youtube is degraded', () => {
        isExtractorDegradedMock.mockReturnValue(true)
        const error = new Error(
            'No results found for "some song" (Extractor: com.discord-player.youtube)',
        )

        expect(
            resolvePlayErrorMessage(
                error,
                'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            ),
        ).toBe(
            'Music sources are currently unreachable. Please try again in a few minutes.',
        )
        expect(isExtractorDegradedMock).toHaveBeenCalledWith('youtube')
    })

    it('does not claim an outage for a text search that found nothing (#2000)', () => {
        // A text search falls through to Spotify and SoundCloud. If it still
        // finds nothing, the healthy engines answered correctly — saying
        // "unreachable" reported an outage that did not happen.
        isExtractorDegradedMock.mockReturnValue(true)
        const error = new Error(
            'No results found for "asdkjhasd" (Extractor: com.discord-player.soundcloudextractor)',
        )

        expect(resolvePlayErrorMessage(error, 'asdkjhasd')).not.toBe(
            'Music sources are currently unreachable. Please try again in a few minutes.',
        )
    })

    it('does not claim an outage for a spotify url while youtube is degraded', () => {
        isExtractorDegradedMock.mockReturnValue(true)
        const error = new Error('No results found for "track"')

        expect(
            resolvePlayErrorMessage(
                error,
                'https://open.spotify.com/track/abc',
            ),
        ).not.toBe(
            'Music sources are currently unreachable. Please try again in a few minutes.',
        )
    })

    it('stays generic when no query is supplied rather than guessing an outage', () => {
        isExtractorDegradedMock.mockReturnValue(true)
        const error = new Error('No results found for "some song"')

        expect(resolvePlayErrorMessage(error)).toContain('No results found')
    })

    it('falls back to the sanitized message for a no-results error when youtube is healthy', () => {
        isExtractorDegradedMock.mockReturnValue(false)
        const error = new Error('No results found for "some song"')

        expect(resolvePlayErrorMessage(error)).toContain('No results found')
    })

    it('does not override an unrelated error even while youtube is degraded', () => {
        isExtractorDegradedMock.mockReturnValue(true)
        const error = new Error('ffmpeg exited unexpectedly')

        expect(resolvePlayErrorMessage(error)).not.toBe(
            'Music sources are currently unreachable. Please try again in a few minutes.',
        )
    })

    it('handles a non-Error thrown value without throwing', () => {
        isExtractorDegradedMock.mockReturnValue(true)

        expect(() =>
            resolvePlayErrorMessage('plain string error'),
        ).not.toThrow()
    })
})

describe('classifyPlayFailure', () => {
    it('counts a search with no results as a user error', () => {
        const error = new Error('No results found for "zzz" (Extractor: N/A)')
        error.name = 'NoResultError'

        expect(classifyPlayFailure(error)).toEqual({
            outcome: 'user_error',
            errorClass: 'Error',
        })
    })

    it('counts a blocked ASMR request as a user error', () => {
        expect(classifyPlayFailure(new AsmrBlockedError()).outcome).toBe(
            'user_error',
        )
    })

    it('counts any other failure as an error with its class', () => {
        expect(classifyPlayFailure(new TypeError('boom'))).toEqual({
            outcome: 'error',
            errorClass: 'TypeError',
        })
    })
})

describe('resolvePlayErrorMessage for YouTube links', () => {
    const t = (key: string) => `t:${key}`

    it('explains that ASMR is blocked', () => {
        expect(resolvePlayErrorMessage(new AsmrBlockedError(), 'asmr', t)).toBe(
            't:music.errors.asmrBlocked',
        )
        expect(resolvePlayErrorMessage(new AsmrBlockedError())).toMatch(/ASMR/)
    })

    it('uses the translated playlist message', () => {
        expect(
            resolvePlayErrorMessage(
                new YoutubePlaylistUnavailableError(),
                'https://www.youtube.com/playlist?list=PLabc',
                t,
            ),
        ).toBe('t:music.errors.youtubePlaylistUnavailable')
    })

    it('uses the translated video message', () => {
        expect(
            resolvePlayErrorMessage(
                new YoutubeVideoUnavailableError(),
                undefined,
                t,
            ),
        ).toBe('t:music.errors.youtubeVideoUnavailable')
    })

    it('says a link is unsupported when only the attachment extractor claimed it', () => {
        // Prod 2026-11-22: a pasted link no real extractor handles fell to
        // AttachmentExtractor and the user saw its raw extractor id.
        const error = new Error(
            'No results found for "https://example.com/song" (Extractor: com.discord-player.attachmentextractor)',
        )

        expect(
            resolvePlayErrorMessage(error, 'https://example.com/song', t),
        ).toBe('t:music.errors.unsupportedLink')
        const fallback = resolvePlayErrorMessage(
            error,
            'https://example.com/song',
        )
        expect(fallback).toMatch(/link isn't supported/i)
        expect(fallback).not.toContain('attachmentextractor')
    })

    it('keeps the no-results message for a text search', () => {
        const error = new Error(
            'No results found for "some song" (Extractor: com.discord-player.attachmentextractor)',
        )

        expect(resolvePlayErrorMessage(error, 'some song', t)).toMatch(
            /^No results found for "some song"/,
        )
    })

    it('does not blame the link when the url only mentions attachmentextractor', () => {
        const query = 'https://example.com/attachmentextractor'
        const error = new Error(
            `No results found for "${query}" (Extractor: com.discord-player.soundcloudextractor)`,
        )

        expect(resolvePlayErrorMessage(error, query, t)).not.toBe(
            't:music.errors.unsupportedLink',
        )
    })

    it('reports an outage, not an unsupported link, for a youtube url while youtube is degraded', () => {
        isExtractorDegradedMock.mockReturnValue(true)
        const query = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        const error = new Error(
            `No results found for "${query}" (Extractor: com.discord-player.attachmentextractor)`,
        )

        expect(resolvePlayErrorMessage(error, query, t)).toMatch(
            /currently unreachable/,
        )
    })

    it('falls back to English without a translator', () => {
        expect(
            resolvePlayErrorMessage(new YoutubePlaylistUnavailableError()),
        ).toMatch(/playlists aren't available/i)
        expect(
            resolvePlayErrorMessage(new YoutubeVideoUnavailableError()),
        ).toMatch(/couldn't play this youtube link/i)
    })
})

describe('logPlayFailure', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        isExtractorDegradedMock.mockReturnValue(false)
    })

    it('logs a no-results failure as a warning without the query text', () => {
        const error = new Error(
            'No results found for "secret query" (Extractor: x)',
        )
        error.name = 'NoResultError'

        logPlayFailure('Play command error:', error, {
            query: 'secret query',
            guildId: 'g1',
        })

        expect(errorLogMock).not.toHaveBeenCalled()
        expect(warnLogMock).toHaveBeenCalledTimes(1)
        const arg = JSON.stringify(warnLogMock.mock.calls[0][0])
        expect(arg).not.toContain('secret query')
        expect(arg).toContain('g1')
    })

    it('keeps reporting an error when youtube is degraded for a youtube query', () => {
        isExtractorDegradedMock.mockReturnValue(true)
        const error = new Error('No results found for "x" (Extractor: y)')

        logPlayFailure('Play command error:', error, {
            query: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            guildId: 'g1',
        })

        expect(warnLogMock).not.toHaveBeenCalled()
        expect(errorLogMock).toHaveBeenCalledTimes(1)
    })

    it('stays a warning when youtube is degraded but the query is a text search', () => {
        isExtractorDegradedMock.mockReturnValue(true)
        const error = new Error('No results found for "x" (Extractor: y)')

        logPlayFailure('Play command error:', error, {
            query: 'some song',
            guildId: 'g1',
        })

        expect(errorLogMock).not.toHaveBeenCalled()
        expect(warnLogMock).toHaveBeenCalledTimes(1)
    })

    it('labels a blocked asmr failure as asmr, not no results', () => {
        logPlayFailure('Play command error:', new AsmrBlockedError(), {
            query: 'asmr',
            guildId: 'g1',
        })

        expect(errorLogMock).not.toHaveBeenCalled()
        const msg = warnLogMock.mock.calls[0][0].message as string
        expect(msg).toContain('ASMR blocked (expected)')
        expect(msg).not.toContain('no results')
    })

    it('still reports other failures as errors', () => {
        const error = new Error('extractor exploded')

        logPlayFailure('Play command error:', error, {
            query: 'q',
            guildId: 'g1',
        })

        expect(warnLogMock).not.toHaveBeenCalled()
        expect(errorLogMock).toHaveBeenCalledWith({
            message: 'Play command error:',
            error,
            data: { query: 'q', guildId: 'g1' },
        })
    })
})
