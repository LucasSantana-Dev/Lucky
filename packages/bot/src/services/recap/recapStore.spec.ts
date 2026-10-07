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
    claimRecapWeek,
    disableRecap,
    enableRecap,
    listDueRecaps,
} from './recapStore'

const NOW = new Date('2026-10-07T12:00:00.000Z')

describe('recapStore (#2678)', () => {
    beforeEach(() => jest.clearAllMocks())

    it('a new opt-in stamps the last post as now, so the first recap waits for Sunday', async () => {
        prisma.guildSettings.updateMany.mockResolvedValue({ count: 0 })

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

    it('moving an opted-in guild keeps its stamp, so a due week still posts', async () => {
        prisma.guildSettings.updateMany.mockResolvedValue({ count: 1 })

        await enableRecap('g-1', 'c-2', NOW)

        expect(prisma.guildSettings.updateMany).toHaveBeenCalledWith({
            where: { guildId: 'g-1', recapChannelId: { not: null } },
            data: { recapChannelId: 'c-2' },
        })
        expect(prisma.guildSettings.upsert).not.toHaveBeenCalled()
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

    it('disabling with a channel only clears that channel', async () => {
        prisma.guildSettings.updateMany.mockResolvedValue({ count: 0 })

        await disableRecap('g-1', 'c-1')

        expect(prisma.guildSettings.updateMany).toHaveBeenCalledWith({
            where: { guildId: 'g-1', recapChannelId: 'c-1' },
            data: { recapChannelId: null },
        })
    })

    it.each([
        [1, true],
        [0, false],
    ])(
        'claiming the week with %i row(s) changed returns %s',
        async (count, expected) => {
            prisma.guildSettings.updateMany.mockResolvedValue({ count })
            const boundary = new Date('2026-10-04T18:00:00.000Z')

            await expect(
                claimRecapWeek('g-1', 'c-1', boundary, NOW),
            ).resolves.toBe(expected)
            expect(prisma.guildSettings.updateMany).toHaveBeenCalledWith({
                where: {
                    guildId: 'g-1',
                    recapChannelId: 'c-1',
                    OR: [
                        { recapLastPostedAt: null },
                        { recapLastPostedAt: { lt: boundary } },
                    ],
                },
                data: { recapLastPostedAt: NOW },
            })
        },
    )
})
