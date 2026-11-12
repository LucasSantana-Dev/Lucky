import { describe, it, expect, jest } from '@jest/globals'
import { QueueRepeatMode } from 'discord-player'
import { calculateQueueStats } from './queueStats'

const getTrackInfoMock = jest.fn()

jest.mock('../../../../services/musicManagement/trackUtils', () => ({
    getTrackInfo: (...args: unknown[]) => getTrackInfoMock(...args),
}))

describe('queueStats', () => {
    it('calculates total tracks, duration and autoplay mode', async () => {
        getTrackInfoMock
            .mockResolvedValueOnce({ duration: '3:30' })
            .mockResolvedValueOnce({ duration: '4:15' })
            .mockResolvedValueOnce({ duration: 'invalid' })

        const queue = {
            tracks: { toArray: () => [{}, {}, {}] },
            node: { getTimestamp: () => ({ current: { value: 42 } }) },
            repeatMode: QueueRepeatMode.AUTOPLAY,
        } as any

        const stats = await calculateQueueStats(queue)

        expect(stats).toEqual({
            totalTracks: 3,
            totalDuration: '7:45',
            currentPosition: 42,
            isLooping: false,
            isShuffled: false,
            autoplayEnabled: true,
        })
    })

    it('formats long durations and track loop status', async () => {
        getTrackInfoMock
            .mockResolvedValueOnce({ duration: '59:59' })
            .mockResolvedValueOnce({ duration: '2:01' })

        const queue = {
            tracks: { toArray: () => [{}, {}] },
            node: { getTimestamp: () => undefined },
            repeatMode: QueueRepeatMode.TRACK,
        } as any

        const stats = await calculateQueueStats(queue)

        expect(stats.totalDuration).toBe('1:02:00')
        expect(stats.currentPosition).toBe(0)
        expect(stats.isLooping).toBe(true)
        expect(stats.autoplayEnabled).toBe(false)
    })
})
