import { afterEach, describe, expect, it, jest } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'
import type { TrackManagementOptions } from './types'

const warnLogMock = jest.fn()
const calculateTrackQualityMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

jest.mock('./trackSimilarity', () => ({
    calculateTrackSimilarity: jest.fn(() => 0),
    calculateTrackQuality: (...args: unknown[]) =>
        calculateTrackQualityMock(...args),
}))

import { validateTrack } from './trackValidator'

const asTrack = (partial: Partial<Track>): Track => partial as Track
const asQueue = (tracks: Track[] = []): GuildQueue =>
    ({ tracks: { toArray: () => tracks } }) as unknown as GuildQueue

describe('validateTrack', () => {
    const options: TrackManagementOptions = {}

    afterEach(() => {
        // clearMocks (jest.config.cjs) only wipes call data, not a
        // mockImplementation set on a plain jest.fn() — reset explicitly so
        // the throw doesn't leak into a later test in this file.
        calculateTrackQualityMock.mockReset()
    })

    it('rejects and warns when calculateTrackQuality throws', () => {
        const track = asTrack({
            title: 'Bad Track',
            url: 'https://example.com/bad',
            duration: 120000,
        })
        calculateTrackQualityMock.mockImplementation(() => {
            throw new Error('scoring exploded')
        })

        const result = validateTrack(track, asQueue(), options)

        expect(result).toEqual({
            isValid: false,
            reason: 'Validation error',
        })
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.any(Error),
                data: expect.objectContaining({
                    title: 'Bad Track',
                    url: 'https://example.com/bad',
                }),
            }),
        )
    })
})
