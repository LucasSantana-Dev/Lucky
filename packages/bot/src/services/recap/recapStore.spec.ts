import { beforeEach, describe, expect, it, jest } from '@jest/globals'

type AnyFn = (...args: any[]) => any
const prisma = {
    guildSettings: {
        upsert: jest.fn<AnyFn>(),
        updateMany: jest.fn<AnyFn>(),
        findMany: jest.fn<AnyFn>(),
        update: jest.fn<AnyFn>(),
    },
}

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: () => prisma,
}))

import {
    disableRecap,
    enableRecap,
    listDueRecaps,
    markRecapPosted,
} from './recapStore'

const NOW = new Date('2026-10-07T12:00:00.000Z')

describe('recapStore (#2678)', () => {
    beforeEach(() => jest.clearAllMocks())

    it('enabling stamps the last post as now, so the first recap waits for Sunday', async () => {
        await enableRecap('g-1', 'c-1', NOW)

        expect(prisma.guildSettings.upsert).toHaveBeenCalledWith({
            where: { guildId: 'g-1' },
            create: {
                guildId: 'g-1',
                recapChannelId: 'c-1',
                recapLastPostedAt: NOW,
            },
            update: { recapChannelId: 'c-1', recapLastPostedAt: NOW },
        })
    })

    it.each([
        [1, true],
        [0, false],
    ])('disable with %i row(s) changed returns %s', async (count, expected) => {
        prisma.guildSettings.updateMany.mockResolvedValue({ count })

        await expect(disableRecap('g-1')).resolves.toBe(expected)
        expect(prisma.guildSettings.updateMany).toHaveBeenCalledWith({
            where: { guildId: 'g-1', recapChannelId: { not: null } },
            data: { recapChannelId: null },
        })
    })

    it('lists opted-in guilds not yet posted since the boundary', async () => {
        prisma.guildSettings.findMany.mockResolvedValue([
            { guildId: 'g-1', recapChannelId: 'c-1' },
            { guildId: 'g-2', recapChannelId: null },
        ])

        await expect(listDueRecaps(NOW)).resolves.toEqual([
            { guildId: 'g-1', channelId: 'c-1' },
        ])
        expect(prisma.guildSettings.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    recapChannelId: { not: null },
                    OR: [
                        { recapLastPostedAt: null },
                        { recapLastPostedAt: { lt: NOW } },
                    ],
                },
            }),
        )
    })

    it('marks the recap posted', async () => {
        await markRecapPosted('g-1', NOW)

        expect(prisma.guildSettings.update).toHaveBeenCalledWith({
            where: { guildId: 'g-1' },
            data: { recapLastPostedAt: NOW },
        })
    })
})
