import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockCreate = jest.fn() as jest.MockedFunction<
    (...args: any[]) => Promise<any>
>
const mockWarnLog = jest.fn()
let mockClientThrows = false

jest.mock('../../utils/database/prismaClient', () => ({
    getPrismaClient: () => {
        if (mockClientThrows) throw new Error('no client')
        return { activationEvent: { create: mockCreate } }
    },
}))
jest.mock('../../utils/general/log', () => ({
    warnLog: (...args: unknown[]) => mockWarnLog(...args),
}))

import { recordActivationEvent } from '../activationEvents'

const GUILD = '123456789012345678'

describe('recordActivationEvent', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockClientThrows = false
        mockCreate.mockResolvedValue({})
    })

    it('writes a row for a snowflake guild id', async () => {
        await expect(
            recordActivationEvent(GUILD, 'station_click', 'started'),
        ).resolves.toBe(true)
        expect(mockCreate).toHaveBeenCalledWith({
            data: {
                guildDiscordId: GUILD,
                kind: 'station_click',
                reason: 'started',
            },
        })
    })

    it('stores a null reason when none is given', async () => {
        await recordActivationEvent(GUILD, 'recap_auto_enabled')
        expect(mockCreate.mock.calls[0][0].data.reason).toBeNull()
    })

    it.each(['unknown', '123', '', 42, null, undefined])(
        'writes nothing for invalid guild id %p',
        async (bad) => {
            await expect(
                recordActivationEvent(bad, 'onboarding_delivered'),
            ).resolves.toBe(false)
            expect(mockCreate).not.toHaveBeenCalled()
        },
    )

    it('swallows an insert failure and logs a warning', async () => {
        mockCreate.mockRejectedValue(new Error('db down'))
        await expect(
            recordActivationEvent(GUILD, 'onboarding_failed', 'x'),
        ).resolves.toBe(false)
        expect(mockWarnLog).toHaveBeenCalledTimes(1)
    })

    it('still resolves false when warnLog itself throws', async () => {
        mockCreate.mockRejectedValue(new Error('db down'))
        mockWarnLog.mockImplementationOnce(() => {
            throw new Error('log down')
        })
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
        await expect(
            recordActivationEvent(GUILD, 'onboarding_failed'),
        ).resolves.toBe(false)
        spy.mockRestore()
    })

    it('returns false when the prisma client itself throws', async () => {
        mockClientThrows = true
        await expect(
            recordActivationEvent(GUILD, 'onboarding_delivered'),
        ).resolves.toBe(false)
        expect(mockWarnLog).toHaveBeenCalledTimes(1)
    })
})
