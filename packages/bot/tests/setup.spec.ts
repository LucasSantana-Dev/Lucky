import { describe, expect, it, jest } from '@jest/globals'

const clearAllSeedsCache = jest.fn()
jest.mock('../src/spotify/spotifyUserSeeds', () => ({ clearAllSeedsCache }))

const recentlyPlayedTracks = { clear: jest.fn() }
const trackIdSet = { clear: jest.fn() }
const lastPlayedTracks = { clear: jest.fn() }
const artistGenreMap = { clear: jest.fn() }
jest.mock('../src/utils/music/duplicateDetection/types', () => ({
    recentlyPlayedTracks,
    trackIdSet,
    lastPlayedTracks,
    artistGenreMap,
}))

const __resetMetadataCacheForTests = jest.fn()
jest.mock('../src/lastfm/lastFmApi', () => ({ __resetMetadataCacheForTests }))

const _resetPopularityCache = jest.fn()
jest.mock('../src/spotify/spotifyApi', () => ({ _resetPopularityCache }))

const clearReplenishSuppressionCache = jest.fn()
jest.mock('../src/services/musicManagement/replenishSuppressionStore', () => ({
    clearReplenishSuppressionCache,
}))

const __resetTrackHandlerCachesForTests = jest.fn()
jest.mock('../src/handlers/player/trackHandlers', () => ({
    __resetTrackHandlerCachesForTests,
}))

import { clearAllCaches } from './setup'

describe('tests/setup clearAllCaches', () => {
    it('calls every module reset function without throwing (regression for #1986)', async () => {
        await expect(clearAllCaches()).resolves.toBeUndefined()

        expect(clearAllSeedsCache).toHaveBeenCalled()
        expect(lastPlayedTracks.clear).toHaveBeenCalled()
        expect(recentlyPlayedTracks.clear).toHaveBeenCalled()
        expect(trackIdSet.clear).toHaveBeenCalled()
        expect(artistGenreMap.clear).toHaveBeenCalled()
        expect(__resetMetadataCacheForTests).toHaveBeenCalled()
        expect(_resetPopularityCache).toHaveBeenCalled()
        expect(clearReplenishSuppressionCache).toHaveBeenCalled()
        expect(__resetTrackHandlerCachesForTests).toHaveBeenCalled()
    })
})
