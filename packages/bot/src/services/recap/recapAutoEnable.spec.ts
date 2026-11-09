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
const recordActivationEventMock = jest.fn(async (..._args: unknown[]) => true)
jest.mock('@lucky/shared/services', () => ({
    recordActivationEvent: (...a: unknown[]) => recordActivationEventMock(...a),
}))
jest.mock('@lucky/shared/utils', () => ({
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
        expect(recordActivationEventMock).toHaveBeenCalledTimes(1)
        expect(recordActivationEventMock).toHaveBeenCalledWith(
            'g-1',
            'recap_auto_enabled',
        )
    })

    it('records nothing when the recap was already decided (false)', async () => {
        autoEnableRecapMock.mockResolvedValue(false)

        await maybeAutoEnableRecap(guild, 'c-1', NOW)

        expect(recordActivationEventMock).not.toHaveBeenCalled()
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

    it('tries once when two plays overlap', async () => {
        await Promise.all([
            maybeAutoEnableRecap(guild, 'c-1', NOW),
            maybeAutoEnableRecap(guild, 'c-2', NOW),
        ])

        expect(resolveRecapChannelMock).toHaveBeenCalledTimes(1)
        expect(autoEnableRecapMock).toHaveBeenCalledTimes(1)
    })

    it('tries the next play when the channel check throws', async () => {
        resolveRecapChannelMock.mockRejectedValueOnce(new Error('discord 503'))

        await expect(maybeAutoEnableRecap(guild, 'c-1', NOW)).rejects.toThrow(
            'discord 503',
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

    // #2860: the skip was a debug line, so prod logs never showed a guild
    // that plays from a channel the recap cannot use.
    it('reports an unusable play channel at info, once per guild', async () => {
        resolveRecapChannelMock.mockResolvedValue({ reason: 'missing_channel' })

        await maybeAutoEnableRecap(guild, 'c-voice', NOW)
        await maybeAutoEnableRecap(guild, 'c-voice-2', NOW)

        expect(infoLogMock).toHaveBeenCalledTimes(1)
        expect(infoLogMock).toHaveBeenCalledWith({
            message: 'recap: play channel unusable, auto-enable skipped',
            data: {
                guildId: 'g-1',
                channelId: 'c-voice',
                reason: 'missing_channel',
            },
        })
    })
})
