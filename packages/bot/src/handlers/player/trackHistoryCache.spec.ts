import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import {
    lastPlayedTracks,
    recentlyPlayedTracks,
    evictOldEntries,
} from './trackHistoryCache'
import type { Track } from 'discord-player'

function createTrack(requestedById = 'listener-1'): Track {
    return {
        id: 'track-1',
        title: 'Test Song',
        author: 'Test Artist',
        url: 'https://example.com/track-1',
        source: 'youtube',
        requestedBy: { id: requestedById },
    } as unknown as Track
}

describe('trackHistoryCache eviction', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        lastPlayedTracks.clear()
        recentlyPlayedTracks.clear()
    })

    it('evicts old track entries when playerStart runs beyond the per-guild cap', async () => {
        for (let index = 0; index < 501; index += 1) {
            lastPlayedTracks.set(
                `guild-${index}`,
                createTrack(`listener-${index}`),
            )
        }
        for (let index = 0; index < 501; index += 1) {
            recentlyPlayedTracks.set(`history-guild-${index}`, [
                {
                    url: `https://example.com/history/${index}`,
                    title: `History Song ${index}`,
                    author: 'Artist',
                    timestamp: index,
                },
            ])
        }
        recentlyPlayedTracks.set(
            'guild-1',
            Array.from({ length: 501 }, (_, index) => ({
                url: `https://example.com/${index}`,
                title: `Song ${index}`,
                author: 'Artist',
                timestamp: index,
            })),
        )

        evictOldEntries()

        expect(lastPlayedTracks.size).toBe(500)
        expect(lastPlayedTracks.has('guild-0')).toBe(false)
        expect(recentlyPlayedTracks.size).toBe(500)
        expect(recentlyPlayedTracks.has('history-guild-0')).toBe(false)
        expect(recentlyPlayedTracks.get('guild-1')).toHaveLength(500)
    })
})
