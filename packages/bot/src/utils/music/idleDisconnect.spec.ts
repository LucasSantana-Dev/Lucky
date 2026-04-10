import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { GuildQueue } from 'discord-player'
import type { TextChannel, Guild } from 'discord.js'

const getGuildSettingsMock = jest.fn()
const markIntentionalStopMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        getGuildSettings: (...args: unknown[]) => getGuildSettingsMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
}))

jest.mock('./watchdog', () => ({
    musicWatchdogService: {
        markIntentionalStop: (...args: unknown[]) => markIntentionalStopMock(...args),
    },
}))

describe('idleDisconnect', () => {
    let mockQueue: Partial<GuildQueue>
    let mockGuild: Partial<Guild>
    let mockChannel: Partial<TextChannel>
    let scheduleIdleDisconnect: any
    let clearIdleTimer: any

    beforeEach(async () => {
        jest.useFakeTimers()
        jest.clearAllMocks()

        mockGuild = { id: 'guild-123' }
        mockChannel = { send: jest.fn().mockResolvedValue(undefined) }
        mockQueue = {
            guild: mockGuild as Guild,
            delete: jest.fn(),
            metadata: { channel: mockChannel },
        } as unknown as GuildQueue

        const module = await import('./idleDisconnect')
        scheduleIdleDisconnect = module.scheduleIdleDisconnect
        clearIdleTimer = module.clearIdleTimer
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    it('should not schedule timer when idleTimeoutMinutes is 0', async () => {
        getGuildSettingsMock.mockResolvedValue({ idleTimeoutMinutes: 0 })

        scheduleIdleDisconnect(mockQueue as GuildQueue)
        await jest.runAllTimersAsync()

        expect(mockQueue.delete).not.toHaveBeenCalled()
    })

    it('should schedule timer when idleTimeoutMinutes is set', async () => {
        getGuildSettingsMock.mockResolvedValue({ idleTimeoutMinutes: 5 })

        scheduleIdleDisconnect(mockQueue as GuildQueue)
        await jest.runOnlyPendingTimersAsync()
        jest.advanceTimersByTime(5 * 60 * 1000)

        expect(mockQueue.delete).toHaveBeenCalled()
    })

    it('should mark intentional stop before disconnecting', async () => {
        getGuildSettingsMock.mockResolvedValue({ idleTimeoutMinutes: 1 })

        scheduleIdleDisconnect(mockQueue as GuildQueue)
        await jest.runOnlyPendingTimersAsync()
        jest.advanceTimersByTime(1 * 60 * 1000)

        expect(markIntentionalStopMock).toHaveBeenCalledWith('guild-123')
    })

    it('should send message to text channel on disconnect', async () => {
        getGuildSettingsMock.mockResolvedValue({ idleTimeoutMinutes: 1 })

        scheduleIdleDisconnect(mockQueue as GuildQueue)
        await jest.runOnlyPendingTimersAsync()
        jest.advanceTimersByTime(1 * 60 * 1000)

        expect(mockChannel.send).toHaveBeenCalledWith('👋 Left the voice channel due to inactivity.')
    })

    it('should clear existing timer when scheduling new one', async () => {
        getGuildSettingsMock.mockResolvedValue({ idleTimeoutMinutes: 5 })

        scheduleIdleDisconnect(mockQueue as GuildQueue)
        await jest.runOnlyPendingTimersAsync()
        jest.clearAllMocks()

        scheduleIdleDisconnect(mockQueue as GuildQueue)
        await jest.runOnlyPendingTimersAsync()
        jest.advanceTimersByTime(5 * 60 * 1000)

        expect(mockQueue.delete).toHaveBeenCalledTimes(1)
    })

    it('clearIdleTimer should clear active timer', async () => {
        getGuildSettingsMock.mockResolvedValue({ idleTimeoutMinutes: 5 })

        scheduleIdleDisconnect(mockQueue as GuildQueue)
        await jest.runOnlyPendingTimersAsync()

        clearIdleTimer('guild-123')
        jest.clearAllMocks()
        jest.advanceTimersByTime(5 * 60 * 1000)

        expect(mockQueue.delete).not.toHaveBeenCalled()
    })
})
