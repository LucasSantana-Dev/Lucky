import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Guild } from 'discord.js'

type AnyFn = (...args: any[]) => any
const resolveRecapChannelMock = jest.fn<AnyFn>()
const autoEnableRecapMock = jest.fn<AnyFn>()
const infoLogMock = jest.fn()

jest.mock('./recapScheduler', () => ({
    resolveRecapChannel: (...a: unknown[]) => resolveRecapChannelMock(...a),
}))
jest.mock('./recapStore', () => ({
    autoEnableRecap: (...a: unknown[]) => autoEnableRecapMock(...a),
}))
jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    infoLog: (...a: unknown[]) => infoLogMock(...a),
}))

import {
    __resetRecapAutoEnableForTests,
    maybeAutoEnableRecap,
} from './recapAutoEnable'

const NOW = new Date('2026-10-18T12:00:00.000Z')
const guild = { id: 'g-1' } as Guild

describe('maybeAutoEnableRecap (#2738)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        __resetRecapAutoEnableForTests()
        resolveRecapChannelMock.mockResolvedValue({
            channel: { id: 'c-1' },
            canAttach: true,
        })
        autoEnableRecapMock.mockResolvedValue(true)
    })

    it('turns the recap on in the play channel', async () => {
        await maybeAutoEnableRecap(guild, 'c-1', NOW)

        expect(resolveRecapChannelMock).toHaveBeenCalledWith(guild, 'c-1')
        expect(autoEnableRecapMock).toHaveBeenCalledWith('g-1', 'c-1', NOW)
        expect(infoLogMock).toHaveBeenCalledTimes(1)
    })

    it('tries a guild once per process', async () => {
        autoEnableRecapMock.mockResolvedValue(false)

        await maybeAutoEnableRecap(guild, 'c-1', NOW)
        await maybeAutoEnableRecap(guild, 'c-1', NOW)

        expect(autoEnableRecapMock).toHaveBeenCalledTimes(1)
        expect(infoLogMock).not.toHaveBeenCalled()
    })

    it('does not try again after a failed write', async () => {
        autoEnableRecapMock.mockRejectedValueOnce(new Error('db down'))

        await expect(maybeAutoEnableRecap(guild, 'c-1', NOW)).rejects.toThrow(
            'db down',
        )
        await maybeAutoEnableRecap(guild, 'c-1', NOW)

        expect(autoEnableRecapMock).toHaveBeenCalledTimes(1)
    })

    it('skips a channel it cannot post in, and tries the next play', async () => {
        resolveRecapChannelMock.mockResolvedValueOnce({
            reason: 'missing_permissions',
        })

        await maybeAutoEnableRecap(guild, 'c-locked', NOW)
        expect(autoEnableRecapMock).not.toHaveBeenCalled()

        await maybeAutoEnableRecap(guild, 'c-1', NOW)
        expect(autoEnableRecapMock).toHaveBeenCalledWith('g-1', 'c-1', NOW)
    })
})
