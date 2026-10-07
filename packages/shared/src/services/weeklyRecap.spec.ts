import { describe, expect, it, jest, beforeEach } from '@jest/globals'

type AsyncMock = jest.MockedFunction<(...args: any[]) => Promise<any>>
const mockAggregate = jest.fn() as AsyncMock
const mockCount = jest.fn() as AsyncMock
const mockGroupBy = jest.fn() as AsyncMock
const mockFindMany = jest.fn() as AsyncMock

jest.mock('../utils/database/prismaClient', () => ({
    getPrismaClient: () => ({
        trackHistory: {
            aggregate: mockAggregate,
            count: mockCount,
            groupBy: mockGroupBy,
            findMany: mockFindMany,
        },
    }),
}))

import { getRecapCardTracks, getWeeklyRecap } from './weeklyRecap'

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
        // Exact options: no take/skip, so the whole window is counted.
        expect(mockAggregate).toHaveBeenCalledWith({
            where,
            _count: { _all: true },
            _sum: { playDuration: true },
        })
        expect(mockCount).toHaveBeenCalledWith({
            where: { ...where, skipped: true },
        })
        expect(mockCount).toHaveBeenCalledWith({
            where: { ...where, isAutoplay: true },
        })
        expect(mockGroupBy).toHaveBeenCalledTimes(2)
        for (const call of mockGroupBy.mock.calls) {
            expect(call[0]).toEqual(
                expect.objectContaining({
                    where: { ...where, skipped: false },
                    take: 5,
                }),
            )
        }
    })

    it('ranks the top lists by plays that were not skipped (#2690)', async () => {
        mockAggregate.mockResolvedValue({
            _count: { _all: 0 },
            _sum: { playDuration: null },
        })
        mockCount.mockResolvedValue(0)
        mockGroupBy.mockResolvedValue([])

        await getWeeklyRecap(GUILD, FROM, TO)

        for (const call of mockGroupBy.mock.calls) {
            expect(call[0].where).toHaveProperty('skipped', false)
        }
        // Totals still count every start; skips are reported beside them.
        expect(mockAggregate.mock.calls[0][0].where).not.toHaveProperty(
            'skipped',
        )
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
                orderBy: [
                    { _count: { title: 'desc' } },
                    { title: 'asc' },
                    { author: 'asc' },
                ],
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

describe('getRecapCardTracks (#2693)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('ranks like the embed and takes up to 25 tracks', async () => {
        mockGroupBy.mockResolvedValue([])

        await getRecapCardTracks(GUILD, FROM, TO)

        expect(mockGroupBy).toHaveBeenCalledWith({
            by: ['title', 'author'],
            where: {
                guildId: GUILD,
                playedAt: { gte: FROM, lt: TO },
                skipped: false,
            },
            _count: { _all: true },
            orderBy: [
                { _count: { title: 'desc' } },
                { title: 'asc' },
                { author: 'asc' },
            ],
            take: 25,
        })
        expect(mockFindMany).not.toHaveBeenCalled()
    })

    it('attaches the most recent non-null thumbnail with one extra query', async () => {
        mockGroupBy.mockResolvedValue([
            { title: 'A', author: 'X', _count: { _all: 4 } },
            { title: 'B', author: 'Y', _count: { _all: 2 } },
        ])
        mockFindMany.mockResolvedValue([
            {
                title: 'A',
                author: 'X',
                thumbnail: 'https://i.ytimg.com/vi/a/1.jpg',
            },
        ])

        const tracks = await getRecapCardTracks(GUILD, FROM, TO)

        expect(tracks).toEqual([
            {
                title: 'A',
                author: 'X',
                plays: 4,
                thumbnail: 'https://i.ytimg.com/vi/a/1.jpg',
            },
            { title: 'B', author: 'Y', plays: 2, thumbnail: null },
        ])
        expect(mockFindMany).toHaveBeenCalledTimes(1)
        expect(mockFindMany).toHaveBeenCalledWith({
            where: {
                guildId: GUILD,
                playedAt: { gte: FROM, lt: TO },
                skipped: false,
                thumbnail: { not: null },
                OR: [
                    { title: 'A', author: 'X' },
                    { title: 'B', author: 'Y' },
                ],
            },
            orderBy: { playedAt: 'desc' },
            distinct: ['title', 'author'],
            select: { title: true, author: true, thumbnail: true },
        })
    })

    it('does not tell title/author pairs apart by joining them', async () => {
        mockGroupBy.mockResolvedValue([
            { title: 'a|b', author: 'c', _count: { _all: 1 } },
            { title: 'a', author: 'b|c', _count: { _all: 1 } },
        ])
        mockFindMany.mockResolvedValue([
            {
                title: 'a',
                author: 'b|c',
                thumbnail: 'https://i.ytimg.com/vi/z/1.jpg',
            },
        ])

        const tracks = await getRecapCardTracks(GUILD, FROM, TO)

        expect(tracks[0].thumbnail).toBeNull()
        expect(tracks[1].thumbnail).toBe('https://i.ytimg.com/vi/z/1.jpg')
    })
})
