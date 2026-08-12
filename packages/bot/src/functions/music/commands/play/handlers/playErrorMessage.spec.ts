import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const isExtractorDegradedMock = jest.fn(() => false)

jest.mock('../../../../../handlers/player/extractorHealth', () => ({
    isExtractorDegraded: (...args: unknown[]) =>
        isExtractorDegradedMock(...args),
}))

import { resolvePlayErrorMessage } from './playErrorMessage'

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

        expect(resolvePlayErrorMessage(error)).toBe(
            'Music sources are currently unreachable. Please try again in a few minutes.',
        )
        expect(isExtractorDegradedMock).toHaveBeenCalledWith('youtube')
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
