import { describe, expect, it, jest } from '@jest/globals'
import { TrackProcessor } from './trackProcessor'

jest.mock('@lucky/shared/utils', () => ({
    safeSetInterval: jest.fn(),
}))

jest.mock('../titleComparison', () => ({
    isSimilarTitle: jest.fn(),
}))

describe('TrackProcessor.getTrackInfo', () => {
    it('maps recommendation/session metadata fields', () => {
        const processor = new TrackProcessor()
        const info = processor.getTrackInfo({
            title: 'Song A',
            duration: '3:20',
            requestedBy: { username: 'UserA' },
            metadata: {
                isAutoplay: true,
                recommendationReason: 'fresh artist rotation',
                recommendationFeedback: 'like',
                sessionSnapshotId: 'snap-1',
            },
        } as any)

        expect(info).toEqual({
            title: 'Song A',
            duration: '3:20',
            requester: 'UserA',
            isAutoplay: true,
            recommendationReason: 'fresh artist rotation',
            recommendationFeedback: 'like',
            sessionSnapshotId: 'snap-1',
        })
    })

    it('uses safe defaults when metadata is not provided', () => {
        const processor = new TrackProcessor()
        const info = processor.getTrackInfo({
            title: 'Song B',
            duration: '2:10',
            requestedBy: null,
        } as any)

        expect(info.requester).toBe('Unknown')
        expect(info.isAutoplay).toBe(false)
        expect(info.recommendationReason).toBeUndefined()
        expect(info.recommendationFeedback).toBeUndefined()
        expect(info.sessionSnapshotId).toBeUndefined()
    })
})
