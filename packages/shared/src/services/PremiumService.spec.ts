import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('../utils/database/prismaClient', () => {
    const findUnique = jest.fn()
    return {
        getPrismaClient: () => ({ guildSubscription: { findUnique } }),
        __mocks: { findUnique },
    }
})

jest.mock('../utils/general/log', () => ({
    errorLog: jest.fn(),
}))

const { __mocks } = jest.requireMock('../utils/database/prismaClient') as {
    __mocks: {
        findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>
    }
}

import { PremiumService } from './PremiumService'

beforeEach(() => {
    __mocks.findUnique.mockReset()
})

describe('PremiumService.isPremium', () => {
    const service = new PremiumService()

    test('returns false when no subscription exists', async () => {
        __mocks.findUnique.mockResolvedValue(null)
        expect(await service.isPremium('g1')).toBe(false)
    })

    test('returns true for active status with future period end', async () => {
        __mocks.findUnique.mockResolvedValue({
            status: 'active',
            currentPeriodEnd: new Date(Date.now() + 86400000),
        })
        expect(await service.isPremium('g1')).toBe(true)
    })

    test('returns true for trialing status', async () => {
        __mocks.findUnique.mockResolvedValue({
            status: 'trialing',
            currentPeriodEnd: new Date(Date.now() + 86400000),
        })
        expect(await service.isPremium('g1')).toBe(true)
    })

    test('returns true when no period end is set (safety default)', async () => {
        __mocks.findUnique.mockResolvedValue({
            status: 'active',
            currentPeriodEnd: null,
        })
        expect(await service.isPremium('g1')).toBe(true)
    })

    test('returns false for canceled status', async () => {
        __mocks.findUnique.mockResolvedValue({
            status: 'canceled',
            currentPeriodEnd: new Date(Date.now() + 86400000),
        })
        expect(await service.isPremium('g1')).toBe(false)
    })

    test('returns false for past_due', async () => {
        __mocks.findUnique.mockResolvedValue({
            status: 'past_due',
            currentPeriodEnd: new Date(Date.now() + 86400000),
        })
        expect(await service.isPremium('g1')).toBe(false)
    })

    test('returns false for incomplete', async () => {
        __mocks.findUnique.mockResolvedValue({
            status: 'incomplete',
            currentPeriodEnd: null,
        })
        expect(await service.isPremium('g1')).toBe(false)
    })

    test('returns false when period end is in the past (webhook-drop safety net)', async () => {
        __mocks.findUnique.mockResolvedValue({
            status: 'active',
            currentPeriodEnd: new Date(Date.now() - 60000),
        })
        expect(await service.isPremium('g1')).toBe(false)
    })

    test('returns false (fail-closed) when DB throws', async () => {
        __mocks.findUnique.mockRejectedValue(new Error('db down'))
        expect(await service.isPremium('g1')).toBe(false)
    })
})

describe('PremiumService.getSubscription', () => {
    const service = new PremiumService()

    test('forwards the row from prisma when present', async () => {
        const row = { id: 'sub-1', guildId: 'g1', status: 'active' }
        __mocks.findUnique.mockResolvedValue(row)
        expect(await service.getSubscription('g1')).toEqual(row)
        expect(__mocks.findUnique).toHaveBeenCalledWith({ where: { guildId: 'g1' } })
    })

    test('returns null when no row exists', async () => {
        __mocks.findUnique.mockResolvedValue(null)
        expect(await service.getSubscription('g1')).toBeNull()
    })

    test('returns null on DB error (caller shouldn\'t crash)', async () => {
        __mocks.findUnique.mockRejectedValue(new Error('db down'))
        expect(await service.getSubscription('g1')).toBeNull()
    })
})
