import { describe, expect, it, jest, beforeEach } from '@jest/globals'

type AsyncMock = jest.MockedFunction<(...args: any[]) => Promise<any>>
const mockAggregate = jest.fn() as AsyncMock
const mockCount = jest.fn() as AsyncMock
const mockGroupBy = jest.fn() as AsyncMock

jest.mock('../utils/database/prismaClient', () => ({
    getPrismaClient: () => ({
        trackHistory: {
            aggregate: mockAggregate,
            count: mockCount,
            groupBy: mockGroupBy,
        },
    }),
}))

import { getWeeklyRecap } from './weeklyRecap'

const GUILD = 'guild-1'
const FROM = new Date('2026-10-04T18:00:00Z')
const TO = new Date('2026-10-11T18:00:00Z')

describe('getWeeklyRecap (#2678)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('aggregates the window into a versioned payload', async () => {
        mockAggregate.mockResolvedValue({
            _count: { _all: 12 },
            _sum: { playDuration: 2400 },
        })
        mockCount.mockResolvedValueOnce(3).mockResolvedValueOnce(7)
        mockGroupBy
            .mockResolvedValueOnce([
                { title: 'Song A', author: 'Artist A', _count: { _all: 4 } },
            ])
            .mockResolvedValueOnce([
                { author: 'Artist A', _count: { _all: 6 } },
            ])

        const recap = await getWeeklyRecap(GUILD, FROM, TO)

        expect(recap).toEqual({
            schemaVersion: 1,
            guildId: GUILD,
            from: '2026-10-04T18:00:00.000Z',
            to: '2026-10-11T18:00:00.000Z',
            plays: 12,
            skips: 3,
            autoplayPlays: 7,
            listenedSeconds: 2400,
            topTracks: [{ title: 'Song A', author: 'Artist A', plays: 4 }],
            topArtists: [{ name: 'Artist A', plays: 6 }],
        })
    })

    it('reads [from, to) for the guild only, with no TTL or row cap', async () => {
        mockAggregate.mockResolvedValue({
            _count: { _all: 0 },
            _sum: { playDuration: null },
        })
        mockCount.mockResolvedValue(0)
        mockGroupBy.mockResolvedValue([])

        await getWeeklyRecap(GUILD, FROM, TO)

        const where = { guildId: GUILD, playedAt: { gte: FROM, lt: TO } }
        expect(mockAggregate).toHaveBeenCalledWith(
            expect.objectContaining({ where }),
        )
        expect(mockCount).toHaveBeenCalledWith({
            where: { ...where, skipped: true },
        })
        expect(mockCount).toHaveBeenCalledWith({
            where: { ...where, isAutoplay: true },
        })
        for (const call of mockGroupBy.mock.calls) {
            expect(call[0]).toEqual(expect.objectContaining({ where, take: 5 }))
        }
    })

    it('returns zeros and empty lists for an empty week', async () => {
        mockAggregate.mockResolvedValue({
            _count: { _all: 0 },
            _sum: { playDuration: null },
        })
        mockCount.mockResolvedValue(0)
        mockGroupBy.mockResolvedValue([])

        const recap = await getWeeklyRecap(GUILD, FROM, TO)

        expect(recap.plays).toBe(0)
        expect(recap.listenedSeconds).toBe(0)
        expect(recap.topTracks).toEqual([])
        expect(recap.topArtists).toEqual([])
    })

    it('ranks by play count, ties broken alphabetically', async () => {
        mockAggregate.mockResolvedValue({
            _count: { _all: 1 },
            _sum: { playDuration: 1 },
        })
        mockCount.mockResolvedValue(0)
        mockGroupBy.mockResolvedValue([])

        await getWeeklyRecap(GUILD, FROM, TO)

        expect(mockGroupBy).toHaveBeenCalledWith(
            expect.objectContaining({
                by: ['title', 'author'],
                orderBy: [{ _count: { title: 'desc' } }, { title: 'asc' }],
            }),
        )
        expect(mockGroupBy).toHaveBeenCalledWith(
            expect.objectContaining({
                by: ['author'],
                orderBy: [{ _count: { author: 'desc' } }, { author: 'asc' }],
            }),
        )
    })
})
