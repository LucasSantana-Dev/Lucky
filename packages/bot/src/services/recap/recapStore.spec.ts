import { beforeEach, describe, expect, it, jest } from '@jest/globals'

type AnyFn = (...args: any[]) => any
const prisma = {
    guildSettings: {
        upsert: jest.fn<AnyFn>(),
        updateMany: jest.fn<AnyFn>(),
        createMany: jest.fn<AnyFn>(),
        findMany: jest.fn<AnyFn>(),
        update: jest.fn<AnyFn>(),
    },
}

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: () => prisma,
}))

import {
    autoEnableRecap,
    claimRecapWeek,
    disableRecap,
    enableRecap,
    listDueRecaps,
    releaseRecapWeek,
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
                recapDecidedAt: NOW,
            },
            update: {
                recapChannelId: 'c-1',
                recapLastPostedAt: NOW,
                recapDecidedAt: NOW,
            },
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

    it('releasing only undoes this claim', async () => {
        await releaseRecapWeek('g-1', NOW)

        expect(prisma.guildSettings.updateMany).toHaveBeenCalledWith({
            where: { guildId: 'g-1', recapLastPostedAt: NOW },
            data: { recapLastPostedAt: null },
        })
    })

    describe('autoEnableRecap (#2738)', () => {
        const enabled = {
            recapChannelId: 'c-1',
            recapLastPostedAt: NOW,
            recapDecidedAt: NOW,
        }

        it('turns the recap on for an undecided guild', async () => {
            prisma.guildSettings.updateMany.mockResolvedValue({ count: 1 })

            await expect(autoEnableRecap('g-1', 'c-1', NOW)).resolves.toBe(true)
            expect(prisma.guildSettings.updateMany).toHaveBeenCalledWith({
                where: {
                    guildId: 'g-1',
                    recapDecidedAt: null,
                    recapChannelId: null,
                    recapLastPostedAt: null,
                },
                data: enabled,
            })
            expect(prisma.guildSettings.createMany).not.toHaveBeenCalled()
        })

        it('creates the settings row when the guild has none', async () => {
            prisma.guildSettings.updateMany.mockResolvedValue({ count: 0 })
            prisma.guildSettings.createMany.mockResolvedValue({ count: 1 })

            await expect(autoEnableRecap('g-1', 'c-1', NOW)).resolves.toBe(true)
            expect(prisma.guildSettings.createMany).toHaveBeenCalledWith({
                data: [{ guildId: 'g-1', ...enabled }],
                skipDuplicates: true,
            })
        })

        it('leaves a guild that already chose alone', async () => {
            prisma.guildSettings.updateMany.mockResolvedValue({ count: 0 })
            prisma.guildSettings.createMany.mockResolvedValue({ count: 0 })

            await expect(autoEnableRecap('g-1', 'c-1', NOW)).resolves.toBe(
                false,
            )
            // Only an undecided row is updated, and an existing row is never
            // overwritten by the create fallback.
            expect(prisma.guildSettings.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ recapDecidedAt: null }),
                }),
            )
            expect(prisma.guildSettings.createMany).toHaveBeenCalledWith(
                expect.objectContaining({ skipDuplicates: true }),
            )
            expect(prisma.guildSettings.upsert).not.toHaveBeenCalled()
        })
    })

    describe('an admin off marks the choice (#2738)', () => {
        it('marks a guild that never had the recap on', async () => {
            prisma.guildSettings.updateMany.mockResolvedValue({ count: 0 })

            await expect(disableRecap('g-1', undefined, NOW)).resolves.toBe(
                false,
            )
            expect(prisma.guildSettings.updateMany).toHaveBeenCalledWith({
                where: { guildId: 'g-1', recapDecidedAt: null },
                data: { recapDecidedAt: NOW },
            })
            expect(prisma.guildSettings.createMany).toHaveBeenCalledWith({
                data: [{ guildId: 'g-1', recapDecidedAt: NOW }],
                skipDuplicates: true,
            })
        })

        it('keeps an earlier decision date', async () => {
            prisma.guildSettings.updateMany
                .mockResolvedValueOnce({ count: 1 })
                .mockResolvedValueOnce({ count: 1 })

            await expect(disableRecap('g-1', undefined, NOW)).resolves.toBe(
                true,
            )
            expect(prisma.guildSettings.createMany).not.toHaveBeenCalled()
        })

        it('does not mark the choice on a scheduler cleanup', async () => {
            prisma.guildSettings.updateMany.mockResolvedValue({ count: 1 })

            await disableRecap('g-1', 'c-1', NOW)

            expect(prisma.guildSettings.updateMany).toHaveBeenCalledTimes(1)
            expect(prisma.guildSettings.createMany).not.toHaveBeenCalled()
        })
    })
})
