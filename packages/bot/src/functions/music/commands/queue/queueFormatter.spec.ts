import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
    formatAutoplayTracksList,
    formatCurrentTrackEmbed,
    formatManualTracksList,
    formatQueueStatistics,
    formatRemainingTracks,
} from './queueFormatter'

const getTrackInfoMock = jest.fn()
const createEmbedMock = jest.fn((payload: unknown) => payload)

jest.mock('../../../../utils/music/trackUtils', () => ({
    getTrackInfo: (...args: unknown[]) => getTrackInfoMock(...args),
}))

jest.mock('../../../../utils/general/embeds', () => ({
    createEmbed: (...args: unknown[]) => createEmbedMock(...args),
    EMBED_COLORS: { QUEUE: '#123456' },
}))

describe('queueFormatter', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('returns fallback now-playing field when no current track exists', () => {
        const field = formatCurrentTrackEmbed(null, { user: { id: 'bot' } } as any)

        expect(field).toEqual({
            name: '▶️ Now Playing',
            value: 'No music is currently playing',
        })
    })

    it('includes autoplay recommendation reason in now-playing and next track', () => {
        getTrackInfoMock
            .mockReturnValueOnce({
                title: 'Current',
                duration: '3:00',
                requester: 'Autoplay',
                recommendationReason: 'fresh artist rotation',
            })
            .mockReturnValueOnce({
                title: 'Next',
                duration: '4:00',
                requester: 'Autoplay',
                recommendationReason: 'similar title mood',
            })

        const queue = {
            currentTrack: {
                requestedBy: { id: 'bot-user' },
            },
            tracks: {
                at: jest.fn(() => ({ requestedBy: { id: 'bot-user' } })),
            },
        }
        const client = { user: { id: 'bot-user' } }

        const field = formatCurrentTrackEmbed(queue as any, client as any)

        expect(field.value).toContain('🤖 Autoplay')
        expect(field.value).toContain('Why this track: fresh artist rotation')
        expect(field.value).toContain('Why this track: similar title mood')
    })

    it('formats manual and autoplay track lists with requester tags', () => {
        getTrackInfoMock
            .mockReturnValueOnce({
                title: 'Manual song',
                duration: '2:30',
                requester: 'User A',
            })
            .mockReturnValueOnce({
                title: 'Auto song',
                duration: '3:10',
                requester: 'Autoplay',
                recommendationReason: 'same source profile',
            })

        const manual = formatManualTracksList([{} as any], {} as any)
        const autoplay = formatAutoplayTracksList([{} as any], {} as any)

        expect(manual).toContain('👤 Manual')
        expect(autoplay).toContain('🤖 Autoplay')
        expect(autoplay).toContain('Why: same source profile')
    })

    it('formats remaining and statistics sections', () => {
        const remaining = formatRemainingTracks(
            new Array(12).fill({}),
            new Array(13).fill({}),
        )
        const stats = formatQueueStatistics(
            {
                repeatMode: 3,
                node: { volume: 55 },
                tracks: { size: 9 },
            } as any,
            {
                manualTracks: new Array(4).fill({}) as any,
                autoplayTracks: new Array(5).fill({}) as any,
                totalTracks: 9,
            },
        )

        expect(remaining).toContain('2 more manual songs')
        expect(remaining).toContain('3 more autoplay songs')
        expect(stats.value).toContain('Manual songs: 4')
        expect(stats.value).toContain('Autoplay songs: 5')
        expect(stats.value).toContain('Volume: 55%')
    })
})
