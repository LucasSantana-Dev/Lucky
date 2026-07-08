import { jest } from '@jest/globals'

// Neutralize the @snazzah/davey native addon (Discord DAVE E2E encryption).
// It is pulled in transitively (discord-player → discord-voip → @snazzah/davey)
// and registers a native `CustomGC` handle that keeps the jest worker alive.
// Under multi-worker runs jest force-exits the un-exitable worker, and whatever
// test is in-flight there times out — an intermittent, victim-varies failure
// that vanishes on rerun (the backend hit the same leak: #1322). discord-voip
// wraps the require in try/catch (DAVE is optional) and bot specs never exercise
// it, so an empty module is safe.
jest.mock('@snazzah/davey', () => ({}))

// Patch setTimeout and setInterval to unref timers. LRUCache creates internal
// setTimeout handlers for TTL expiry, and these keep Node.js event loop alive.
// By unreferencing them, we make jest exit gracefully without waiting for
// cache TTL timers (issue #1553).
const originalSetTimeout = global.setTimeout
const originalSetInterval = global.setInterval
global.setTimeout = function (
    callback: TimerHandler,
    delay?: number,
    ...args: unknown[]
) {
    const timeoutId = originalSetTimeout.call(
        this,
        callback,
        delay,
        ...args,
    ) as NodeJS.Timeout
    try {
        timeoutId.unref?.()
    } catch {
        // Ignore; worst case timer stays ref'd
    }
    return timeoutId
} as typeof setTimeout

global.setInterval = function (
    callback: TimerHandler,
    delay?: number,
    ...args: unknown[]
) {
    const intervalId = originalSetInterval.call(
        this,
        callback,
        delay,
        ...args,
    ) as NodeJS.Timeout
    try {
        intervalId.unref?.()
    } catch {
        // Ignore; worst case timer stays ref'd
    }
    return intervalId
} as typeof setInterval

// Register a beforeExit handler to clear all LRUCache TTL timers before process
// exits. This is necessary because the timers are created at module load time
// and kept alive throughout the process, keeping jest workers from exiting
// gracefully (issue #1553).
process.on('beforeExit', clearAllCaches)

async function clearAllCaches() {
    try {
        const { clearAllSeedsCache } =
            await import('../src/spotify/spotifyUserSeeds')
        clearAllSeedsCache()
    } catch {
        // May not be loaded
    }

    try {
        const {
            recentlyPlayedTracks,
            trackIdSet,
            lastPlayedTracks,
            artistGenreMap,
        } = await import('../src/utils/music/duplicateDetection/types')
        recentlyPlayedTracks.clear()
        trackIdSet.clear()
        lastPlayedTracks.clear()
        artistGenreMap.clear()
    } catch {
        // May not be loaded
    }

    try {
        const { clearLastFmCaches } = await import('../src/lastfm/lastFmApi')
        clearLastFmCaches()
    } catch {
        // May not be loaded
    }

    try {
        const { clearSpotifyApiCaches } =
            await import('../src/spotify/spotifyApi')
        clearSpotifyApiCaches()
    } catch {
        // May not be loaded
    }

    try {
        const { clearReplenishSuppressionCache } =
            await import('../src/utils/music/replenishSuppressionStore')
        clearReplenishSuppressionCache()
    } catch {
        // May not be loaded
    }

    try {
        const { clearAudioFeaturesCache } =
            await import('../src/utils/music/autoplay/audioFeatures')
        clearAudioFeaturesCache()
    } catch {
        // May not be loaded
    }

    try {
        const {
            lastPlayedTracks,
            recentlyPlayedTracks,
            trackStartTimes,
            guildRecentSkipCounts,
        } = await import('../src/handlers/player/trackHandlers')
        lastPlayedTracks.clear()
        recentlyPlayedTracks.clear()
        trackStartTimes.clear()
        guildRecentSkipCounts.clear()
    } catch {
        // May not be loaded
    }
}
