import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { GuildQueue, Track } from 'discord-player'

const watchdogIsIntentionalStopMock = jest.fn()
const watchdogArmMock = jest.fn()
const watchdogClearMock = jest.fn()
const saveSnapshotMock = jest.fn()
const clearSnapshotIfStaleMock = jest.fn()
const clearStatusMock = jest.fn()
const setReplenishSuppressedMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    errorLog: errorLogMock,
}))

jest.mock('../../utils/music/watchdog', () => ({
    musicWatchdogService: {
        isIntentionalStop: watchdogIsIntentionalStopMock,
        arm: watchdogArmMock,
        clear: watchdogClearMock,
    },
}))

jest.mock('../../utils/music/sessionSnapshots', () => ({
    musicSessionSnapshotService: {
        saveSnapshot: saveSnapshotMock,
        clearSnapshotIfStale: clearSnapshotIfStaleMock,
    },
}))

jest.mock('../../services/VoiceChannelStatusService', () => ({
    clearStatus: clearStatusMock,
}))

jest.mock('../../utils/music/replenishSuppressionStore', () => ({
    setReplenishSuppressed: setReplenishSuppressedMock,
}))

const { handleQueueExhaustion } = require('./queueExhaustion')

describe('handleQueueExhaustion', () => {
    let mockQueue: Partial<GuildQueue>
    let mockReplenishIfAutoplay: jest.Mock

    beforeEach(() => {
        jest.clearAllMocks()
        mockQueue = {
            guild: { id: 'guild123' },
            currentTrack: null,
            tracks: { size: 0 },
        }
        mockReplenishIfAutoplay = jest.fn()
        watchdogIsIntentionalStopMock.mockReturnValue(false)
    })

    it('should return early if intentional stop', async () => {
        watchdogIsIntentionalStopMock.mockReturnValue(true)

        await handleQueueExhaustion(mockQueue as GuildQueue, mockReplenishIfAutoplay)

        expect(mockReplenishIfAutoplay).not.toHaveBeenCalled()
    })

    it('should call replenishIfAutoplay and save snapshot when queue has tracks', async () => {
        mockQueue.tracks = { size: 3 } as any
        saveSnapshotMock.mockResolvedValue(undefined)
        watchdogArmMock.mockReturnValue(undefined)

        await handleQueueExhaustion(mockQueue as GuildQueue, mockReplenishIfAutoplay)

        expect(mockReplenishIfAutoplay).toHaveBeenCalledWith(mockQueue)
        expect(saveSnapshotMock).toHaveBeenCalledWith(mockQueue)
        expect(watchdogArmMock).toHaveBeenCalledWith(mockQueue)
    })

    it('should call replenishIfAutoplay and save snapshot when currentTrack exists', async () => {
        mockQueue.currentTrack = { id: 'track123' } as Track
        saveSnapshotMock.mockResolvedValue(undefined)
        watchdogArmMock.mockReturnValue(undefined)

        await handleQueueExhaustion(mockQueue as GuildQueue, mockReplenishIfAutoplay)

        expect(mockReplenishIfAutoplay).toHaveBeenCalledWith(mockQueue)
        expect(saveSnapshotMock).toHaveBeenCalledWith(mockQueue)
        expect(watchdogArmMock).toHaveBeenCalledWith(mockQueue)
    })

    it('should handle queue exhaustion when both currentTrack and tracks are empty', async () => {
        clearStatusMock.mockResolvedValue(undefined)
        saveSnapshotMock.mockResolvedValue(undefined)
        clearSnapshotIfStaleMock.mockResolvedValue(undefined)

        await handleQueueExhaustion(mockQueue as GuildQueue, mockReplenishIfAutoplay)

        expect(mockReplenishIfAutoplay).toHaveBeenCalledWith(mockQueue)
        expect(saveSnapshotMock).toHaveBeenCalledWith(mockQueue)
        expect(clearStatusMock).toHaveBeenCalledWith(mockQueue)
        expect(watchdogClearMock).toHaveBeenCalledWith('guild123')
        expect(setReplenishSuppressedMock).toHaveBeenCalledWith('guild123', 35_000)
        expect(clearSnapshotIfStaleMock).toHaveBeenCalledWith(mockQueue)
    })
})
