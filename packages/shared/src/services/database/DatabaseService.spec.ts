import { describe, it, expect, beforeEach, jest } from '@jest/globals'

const mockConnect = jest.fn<() => Promise<void>>()
const mockDisconnect = jest.fn<() => Promise<void>>()
const mockQueryRaw = jest.fn<() => Promise<unknown>>()
const mockUserUpsert = jest.fn<(args?: any) => Promise<any>>()
const mockUserFindUnique = jest.fn<(args?: any) => Promise<any>>()
const mockGuildUpsert = jest.fn<(args?: any) => Promise<any>>()
const mockGuildFindUnique = jest.fn<(args?: any) => Promise<any>>()
const mockTrackHistoryCreate = jest.fn<(args?: any) => Promise<any>>()
const mockTrackHistoryFindMany = jest.fn<(args?: any) => Promise<any>>()
const mockTrackHistoryGroupBy = jest.fn<(args?: any) => Promise<any>>()
const mockTrackHistoryDeleteMany = jest.fn<(args?: any) => Promise<any>>()
const mockRateLimitFindUnique = jest.fn<(args?: any) => Promise<any>>()
const mockRateLimitUpsert = jest.fn<(args?: any) => Promise<any>>()
const mockRateLimitUpdate = jest.fn<(args?: any) => Promise<any>>()
const mockRateLimitDeleteMany = jest.fn<(args?: any) => Promise<any>>()
const mockGetPrismaClient = jest.fn<() => any>()

jest.mock('../../utils/database/prismaClient', () => ({
    getPrismaClient: mockGetPrismaClient,
}))

jest.mock('../../utils/general/log', () => ({
    infoLog: jest.fn(),
    errorLog: jest.fn(),
}))

import { DatabaseService } from './DatabaseService'
import { errorLog } from '../../utils/general/log'

const TEST_CONFIG = {
    url: 'postgresql://user:pass@localhost:5432/test',
    ttl: 3600,
    maxConnections: 10,
    connectionTimeout: 5000,
}

describe('DatabaseService', () => {
    let service: DatabaseService

    beforeEach(() => {
        jest.clearAllMocks()
        mockGetPrismaClient.mockReturnValue({
            $connect: mockConnect,
            $disconnect: mockDisconnect,
            $queryRaw: mockQueryRaw,
            user: {
                upsert: mockUserUpsert,
                findUnique: mockUserFindUnique,
            },
            guild: {
                upsert: mockGuildUpsert,
                findUnique: mockGuildFindUnique,
            },
            trackHistory: {
                create: mockTrackHistoryCreate,
                findMany: mockTrackHistoryFindMany,
                groupBy: mockTrackHistoryGroupBy,
                deleteMany: mockTrackHistoryDeleteMany,
            },
            rateLimit: {
                findUnique: mockRateLimitFindUnique,
                upsert: mockRateLimitUpsert,
                update: mockRateLimitUpdate,
                deleteMany: mockRateLimitDeleteMany,
            },
        })
        service = new DatabaseService(TEST_CONFIG)
    })

    describe('connect', () => {
        it('establishes connection and returns success', async () => {
            mockConnect.mockResolvedValue(undefined)

            const result = await service.connect()

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toBe(true)
            expect(mockConnect).toHaveBeenCalledTimes(1)
        })

        it('returns true if already connected (skips $connect)', async () => {
            mockConnect.mockResolvedValue(undefined)

            const result1 = await service.connect()
            expect(result1.isSuccess()).toBe(true)

            const result2 = await service.connect()
            expect(result2.isSuccess()).toBe(true)
            expect(mockConnect).toHaveBeenCalledTimes(1)
        })

        it('returns failure on connection error', async () => {
            const connError = new Error('Connection failed')
            mockConnect.mockRejectedValue(connError)

            const result = await service.connect()

            expect(result.isFailure()).toBe(true)
            expect(result.getError()).toBeDefined()
        })

        it('converts non-Error exceptions to Error on connect failure', async () => {
            mockConnect.mockRejectedValue('string error')

            const result = await service.connect()

            expect(result.isFailure()).toBe(true)
            expect(result.getError()).toBeInstanceOf(Error)
        })
    })

    describe('disconnect', () => {
        it('closes connection and returns success', async () => {
            mockConnect.mockResolvedValue(undefined)
            mockDisconnect.mockResolvedValue(undefined)

            await service.connect()
            const result = await service.disconnect()

            expect(result.isSuccess()).toBe(true)
            expect(mockDisconnect).toHaveBeenCalledTimes(1)
        })

        it('skips $disconnect if not connected', async () => {
            const result = await service.disconnect()

            expect(result.isSuccess()).toBe(true)
            expect(mockDisconnect).not.toHaveBeenCalled()
        })

        it('returns failure on disconnect error', async () => {
            mockConnect.mockResolvedValue(undefined)
            mockDisconnect.mockRejectedValue(new Error('Disconnect failed'))

            await service.connect()
            const result = await service.disconnect()

            expect(result.isFailure()).toBe(true)
        })
    })

    describe('isHealthy', () => {
        it('returns true when database responds to health check', async () => {
            mockConnect.mockResolvedValue(undefined)
            mockQueryRaw.mockResolvedValue([{ '1': 1 }])

            await service.connect()
            const result = await service.isHealthy()

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toBe(true)
        })

        it('returns false when not connected', async () => {
            const result = await service.isHealthy()

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toBe(false)
        })

        it('returns failure when query execution fails', async () => {
            mockConnect.mockResolvedValue(undefined)
            mockQueryRaw.mockRejectedValue(new Error('Query failed'))

            await service.connect()
            const result = await service.isHealthy()

            expect(result.isFailure()).toBe(true)
        })
    })

    describe('createUser', () => {
        it('creates new user and returns mapped result', async () => {
            const now = new Date()
            mockUserUpsert.mockResolvedValue({
                id: 'user-1',
                discordId: '123456789',
                username: 'testuser',
                avatar: 'http://example.com/avatar.png',
                createdAt: now,
                updatedAt: now,
            })

            const result = await service.createUser(
                '123456789',
                'testuser',
                'http://example.com/avatar.png',
            )

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()?.discordId).toBe('123456789')
            expect(result.getData()?.username).toBe('testuser')
            expect(result.getData()?.avatar).toBe(
                'http://example.com/avatar.png',
            )
        })

        it('creates user without avatar', async () => {
            const now = new Date()
            mockUserUpsert.mockResolvedValue({
                id: 'user-2',
                discordId: '987654321',
                username: 'noavatar',
                avatar: null,
                createdAt: now,
                updatedAt: now,
            })

            const result = await service.createUser('987654321', 'noavatar')

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()?.avatar).toBeUndefined()
        })

        it('handles upsert error gracefully', async () => {
            mockUserUpsert.mockRejectedValue(
                new Error('Unique constraint violation'),
            )

            const result = await service.createUser('123456789', 'testuser')

            expect(result.isFailure()).toBe(true)
        })

        it('returns fallback value on failure', async () => {
            mockUserUpsert.mockRejectedValue(new Error('DB error'))

            const result = await service.createUser('123456789', 'testuser')

            expect(result.isFailure()).toBe(true)
            expect(result.getError()).toBeDefined()
        })
    })

    describe('getUser', () => {
        it('retrieves user by discord id', async () => {
            const now = new Date()
            mockUserFindUnique.mockResolvedValue({
                id: 'user-1',
                discordId: '123456789',
                username: 'testuser',
                avatar: 'avatar.png',
                createdAt: now,
                updatedAt: now,
            })

            const result = await service.getUser('123456789')

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()?.username).toBe('testuser')
        })

        it('returns null when user not found', async () => {
            mockUserFindUnique.mockResolvedValue(null)

            const result = await service.getUser('999999999')

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toBeNull()
        })

        it('returns failure on query error', async () => {
            mockUserFindUnique.mockRejectedValue(
                new Error('DB connection lost'),
            )

            const result = await service.getUser('123456789')

            expect(result.isFailure()).toBe(true)
        })
    })

    describe('createGuild', () => {
        it('creates new guild and returns mapped result', async () => {
            const now = new Date()
            mockGuildUpsert.mockResolvedValue({
                id: 'guild-1',
                discordId: '111222333',
                name: 'Test Guild',
                icon: 'guild.png',
                ownerId: 'owner-123',
                createdAt: now,
                updatedAt: now,
            })

            const result = await service.createGuild(
                '111222333',
                'Test Guild',
                'owner-123',
                'guild.png',
            )

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()?.name).toBe('Test Guild')
            expect(result.getData()?.ownerId).toBe('owner-123')
        })

        it('creates guild without icon', async () => {
            const now = new Date()
            mockGuildUpsert.mockResolvedValue({
                id: 'guild-2',
                discordId: '222333444',
                name: 'No Icon Guild',
                icon: null,
                ownerId: 'owner-456',
                createdAt: now,
                updatedAt: now,
            })

            const result = await service.createGuild(
                '222333444',
                'No Icon Guild',
                'owner-456',
            )

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()?.icon).toBeUndefined()
        })

        it('handles upsert error for guild creation', async () => {
            mockGuildUpsert.mockRejectedValue(new Error('FK constraint failed'))

            const result = await service.createGuild(
                '111222333',
                'Test Guild',
                'owner-123',
            )

            expect(result.isFailure()).toBe(true)
        })
    })

    describe('getGuild', () => {
        it('retrieves guild by discord id', async () => {
            const now = new Date()
            mockGuildFindUnique.mockResolvedValue({
                id: 'guild-1',
                discordId: '111222333',
                name: 'Test Guild',
                icon: 'guild.png',
                ownerId: 'owner-123',
                createdAt: now,
                updatedAt: now,
            })

            const result = await service.getGuild('111222333')

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()?.name).toBe('Test Guild')
        })

        it('returns null when guild not found', async () => {
            mockGuildFindUnique.mockResolvedValue(null)

            const result = await service.getGuild('999999999')

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toBeNull()
        })

        it('returns failure on query error', async () => {
            mockGuildFindUnique.mockRejectedValue(
                new Error('Connection timeout'),
            )

            const result = await service.getGuild('111222333')

            expect(result.isFailure()).toBe(true)
        })
    })

    describe('addTrackToHistory', () => {
        it('adds track to history and returns mapped result', async () => {
            const now = new Date()
            mockTrackHistoryCreate.mockResolvedValue({
                id: 'track-1',
                guildId: 'guild-1',
                trackId: 'yt-123',
                title: 'Test Song',
                author: 'Test Artist',
                duration: '3:45',
                url: 'https://youtube.com/watch?v=test',
                thumbnail: 'thumb.jpg',
                source: 'youtube',
                playedAt: now,
                createdAt: now,
                playedBy: 'user-1',
                isAutoplay: false,
                playlistName: null,
                playDuration: null,
                skipped: null,
                isPlaylist: null,
            })

            const result = await service.addTrackToHistory({
                guildId: 'guild-1',
                trackId: 'yt-123',
                title: 'Test Song',
                author: 'Test Artist',
                duration: '3:45',
                url: 'https://youtube.com/watch?v=test',
                thumbnail: 'thumb.jpg',
                source: 'youtube',
                playedBy: 'user-1',
                isAutoplay: false,
            })

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()?.title).toBe('Test Song')
            expect(result.getData()?.isAutoplay).toBe(false)
        })

        it('defaults isAutoplay to false when not provided', async () => {
            const now = new Date()
            mockTrackHistoryCreate.mockResolvedValue({
                id: 'track-2',
                guildId: 'guild-1',
                trackId: 'yt-456',
                title: 'Another Song',
                author: 'Another Artist',
                duration: '4:00',
                url: 'https://youtube.com/watch?v=test2',
                thumbnail: null,
                source: 'spotify',
                playedAt: now,
                createdAt: now,
                playedBy: null,
                isAutoplay: false,
                playlistName: null,
                playDuration: null,
                skipped: null,
                isPlaylist: null,
            })

            const result = await service.addTrackToHistory({
                guildId: 'guild-1',
                trackId: 'yt-456',
                title: 'Another Song',
                author: 'Another Artist',
                duration: '4:00',
                url: 'https://youtube.com/watch?v=test2',
                source: 'spotify',
            })

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()?.isAutoplay).toBe(false)
        })

        it('handles create error for track history', async () => {
            mockTrackHistoryCreate.mockRejectedValue(
                new Error('FK: guild not found'),
            )

            const result = await service.addTrackToHistory({
                guildId: 'nonexistent-guild',
                trackId: 'yt-123',
                title: 'Test Song',
                author: 'Test Artist',
                duration: '3:45',
                url: 'https://youtube.com/watch?v=test',
                source: 'youtube',
            })

            expect(result.isFailure()).toBe(true)
        })
    })

    describe('getTrackHistory', () => {
        it('retrieves track history for a guild with default limit', async () => {
            const now = new Date()
            const track = {
                id: 'track-1',
                guildId: 'guild-1',
                trackId: 'yt-123',
                title: 'Test Song',
                author: 'Test Artist',
                duration: '3:45',
                url: 'https://youtube.com/watch?v=test',
                thumbnail: null,
                source: 'youtube',
                playedAt: now,
                createdAt: now,
                playedBy: null,
                isAutoplay: false,
                playlistName: null,
                playDuration: null,
                skipped: null,
                isPlaylist: null,
            }
            mockTrackHistoryFindMany.mockResolvedValue([track])

            const result = await service.getTrackHistory('guild-1')

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toHaveLength(1)
            expect(result.getData()?.[0].title).toBe('Test Song')
        })

        it('respects custom limit parameter', async () => {
            mockTrackHistoryFindMany.mockResolvedValue([])

            await service.getTrackHistory('guild-1', 50)

            expect(mockTrackHistoryFindMany).toHaveBeenCalledWith(
                expect.objectContaining({ take: 50 }),
            )
        })

        it('returns empty array when no tracks found', async () => {
            mockTrackHistoryFindMany.mockResolvedValue([])

            const result = await service.getTrackHistory('guild-1')

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toEqual([])
        })

        it('returns failure on query error', async () => {
            mockTrackHistoryFindMany.mockRejectedValue(
                new Error('DB connection lost'),
            )

            const result = await service.getTrackHistory('guild-1')

            expect(result.isFailure()).toBe(true)
        })
    })

    describe('checkRateLimit', () => {
        it('allows request when under limit and no existing entry', async () => {
            mockRateLimitFindUnique.mockResolvedValue(null)
            mockRateLimitUpsert.mockResolvedValue({
                key: 'user-123',
                count: 1,
                resetAt: new Date(Date.now() + 60000),
            })

            const result = await service.checkRateLimit('user-123', 10, 60000)

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toBe(true)
            expect(mockRateLimitUpsert).toHaveBeenCalled()
        })

        it('allows request when under limit', async () => {
            const resetAt = new Date(Date.now() + 30000)
            mockRateLimitFindUnique.mockResolvedValue({
                resetAt,
                count: 5,
            })
            mockRateLimitUpdate.mockResolvedValue({
                key: 'user-123',
                count: 6,
                resetAt,
            })

            const result = await service.checkRateLimit('user-123', 10, 60000)

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toBe(true)
            expect(mockRateLimitUpdate).toHaveBeenCalled()
        })

        it('denies request when at or over limit', async () => {
            const resetAt = new Date(Date.now() + 30000)
            mockRateLimitFindUnique.mockResolvedValue({
                resetAt,
                count: 10,
            })

            const result = await service.checkRateLimit('user-123', 10, 60000)

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toBe(false)
            expect(mockRateLimitUpdate).not.toHaveBeenCalled()
        })

        it('resets counter when window has expired', async () => {
            const expiredResetAt = new Date(Date.now() - 10000)
            mockRateLimitFindUnique.mockResolvedValue({
                resetAt: expiredResetAt,
                count: 10,
            })
            mockRateLimitUpsert.mockResolvedValue({
                key: 'user-123',
                count: 1,
                resetAt: new Date(Date.now() + 60000),
            })

            const result = await service.checkRateLimit('user-123', 10, 60000)

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toBe(true)
            expect(mockRateLimitUpsert).toHaveBeenCalled()
        })

        it('returns failure on database error', async () => {
            mockRateLimitFindUnique.mockRejectedValue(
                new Error('DB connection failed'),
            )

            const result = await service.checkRateLimit('user-123', 10, 60000)

            expect(result.isFailure()).toBe(true)
        })
    })

    describe('getTopTracks', () => {
        it('returns top tracks grouped by track id, title, author', async () => {
            mockTrackHistoryGroupBy.mockResolvedValue([
                {
                    trackId: 'yt-1',
                    title: 'Top Song',
                    author: 'Top Artist',
                    _count: { trackId: 15 },
                },
                {
                    trackId: 'yt-2',
                    title: 'Second Song',
                    author: 'Second Artist',
                    _count: { trackId: 8 },
                },
            ])

            const result = await service.getTopTracks('guild-1')

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toHaveLength(2)
            expect(result.getData()?.[0].playCount).toBe(15)
            expect(result.getData()?.[1].playCount).toBe(8)
        })

        it('respects custom limit parameter', async () => {
            mockTrackHistoryGroupBy.mockResolvedValue([])

            await service.getTopTracks('guild-1', 50)

            expect(mockTrackHistoryGroupBy).toHaveBeenCalledWith(
                expect.objectContaining({ take: 50 }),
            )
        })

        it('returns empty array when no tracks exist', async () => {
            mockTrackHistoryGroupBy.mockResolvedValue([])

            const result = await service.getTopTracks('guild-1')

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toEqual([])
        })

        it('returns failure on query error', async () => {
            mockTrackHistoryGroupBy.mockRejectedValue(
                new Error('Query execution failed'),
            )

            const result = await service.getTopTracks('guild-1')

            expect(result.isFailure()).toBe(true)
        })

        it('filters out invalid track objects', async () => {
            mockTrackHistoryGroupBy.mockResolvedValue([
                {
                    trackId: 'yt-1',
                    title: 'Valid Song',
                    author: 'Valid Artist',
                    _count: { trackId: 5 },
                },
                null,
                { incomplete: 'object' },
                {
                    trackId: 'yt-2',
                    title: 'Another Song',
                    author: 'Another Artist',
                    _count: { trackId: 3 },
                },
            ])

            const result = await service.getTopTracks('guild-1')

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toHaveLength(2)
        })
    })

    describe('getTopArtists', () => {
        it('returns top artists grouped by author', async () => {
            mockTrackHistoryGroupBy.mockResolvedValue([
                {
                    author: 'Top Artist',
                    _count: { author: 25 },
                },
                {
                    author: 'Second Artist',
                    _count: { author: 12 },
                },
            ])

            const result = await service.getTopArtists('guild-1')

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toHaveLength(2)
            expect(result.getData()?.[0].playCount).toBe(25)
        })

        it('respects custom limit parameter', async () => {
            mockTrackHistoryGroupBy.mockResolvedValue([])

            await service.getTopArtists('guild-1', 25)

            expect(mockTrackHistoryGroupBy).toHaveBeenCalledWith(
                expect.objectContaining({ take: 25 }),
            )
        })

        it('returns empty array when no artists exist', async () => {
            mockTrackHistoryGroupBy.mockResolvedValue([])

            const result = await service.getTopArtists('guild-1')

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toEqual([])
        })

        it('returns failure on query error', async () => {
            mockTrackHistoryGroupBy.mockRejectedValue(
                new Error('GroupBy failed'),
            )

            const result = await service.getTopArtists('guild-1')

            expect(result.isFailure()).toBe(true)
        })

        it('filters out invalid artist objects', async () => {
            mockTrackHistoryGroupBy.mockResolvedValue([
                {
                    author: 'Valid Artist',
                    _count: { author: 10 },
                },
                null,
                { invalid: true },
                {
                    author: 'Another Artist',
                    _count: { author: 7 },
                },
            ])

            const result = await service.getTopArtists('guild-1')

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toHaveLength(2)
        })
    })

    describe('cleanupOldData', () => {
        it('deletes old tracks and rate limits, returns total count', async () => {
            mockTrackHistoryDeleteMany.mockResolvedValue({ count: 50 })
            mockRateLimitDeleteMany.mockResolvedValue({ count: 30 })

            const result = await service.cleanupOldData()

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toBe(80)
            expect(mockTrackHistoryDeleteMany).toHaveBeenCalled()
            expect(mockRateLimitDeleteMany).toHaveBeenCalled()
        })

        it('handles zero deletions', async () => {
            mockTrackHistoryDeleteMany.mockResolvedValue({ count: 0 })
            mockRateLimitDeleteMany.mockResolvedValue({ count: 0 })

            const result = await service.cleanupOldData()

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toBe(0)
        })

        it('returns failure on track deletion error', async () => {
            mockTrackHistoryDeleteMany.mockRejectedValue(
                new Error('Deletion failed'),
            )

            const result = await service.cleanupOldData()

            expect(result.isFailure()).toBe(true)
        })

        it('returns failure on rate limit deletion error', async () => {
            mockTrackHistoryDeleteMany.mockResolvedValue({ count: 10 })
            mockRateLimitDeleteMany.mockRejectedValue(
                new Error('Rate limit deletion failed'),
            )

            const result = await service.cleanupOldData()

            expect(result.isFailure()).toBe(true)
        })
    })

    describe('getClient', () => {
        it('returns the underlying prisma client', () => {
            const client = service.getClient()

            expect(client).toBeDefined()
            expect(client.$connect).toBeDefined()
            expect(client.$disconnect).toBeDefined()
        })
    })

    // Mutation-hardening (#1426): the tests above assert outcomes; these assert
    // the exact query clauses, default values, validation guards, and error
    // labels so mutants that blank a `where`/`data`/`orderBy`, flip a default,
    // or weaken a type guard are KILLED rather than surviving silently.
    describe('query-clause assertions (kill ObjectLiteral mutants)', () => {
        const userRow = {
            id: 'u1',
            discordId: '123',
            username: 'bob',
            avatar: 'a.png',
            createdAt: new Date(),
            updatedAt: new Date(),
        }
        const guildRow = {
            id: 'g1',
            discordId: '777',
            name: 'Guild',
            icon: 'g.png',
            ownerId: 'owner',
            createdAt: new Date(),
            updatedAt: new Date(),
        }

        it('createUser passes where/update/create clauses to upsert', async () => {
            mockUserUpsert.mockResolvedValue(userRow)

            await service.createUser('123', 'bob', 'a.png')

            expect(mockUserUpsert).toHaveBeenCalledWith({
                where: { discordId: '123' },
                update: { username: 'bob', avatar: 'a.png' },
                create: { discordId: '123', username: 'bob', avatar: 'a.png' },
            })
        })

        it('getUser passes where clause to findUnique', async () => {
            mockUserFindUnique.mockResolvedValue(userRow)

            await service.getUser('123')

            expect(mockUserFindUnique).toHaveBeenCalledWith({
                where: { discordId: '123' },
            })
        })

        it('createGuild passes where/update/create clauses to upsert', async () => {
            mockGuildUpsert.mockResolvedValue(guildRow)

            await service.createGuild('777', 'Guild', 'owner', 'g.png')

            expect(mockGuildUpsert).toHaveBeenCalledWith({
                where: { discordId: '777' },
                update: { name: 'Guild', icon: 'g.png' },
                create: {
                    discordId: '777',
                    name: 'Guild',
                    ownerId: 'owner',
                    icon: 'g.png',
                },
            })
        })

        it('getGuild passes where clause to findUnique', async () => {
            mockGuildFindUnique.mockResolvedValue(guildRow)

            await service.getGuild('777')

            expect(mockGuildFindUnique).toHaveBeenCalledWith({
                where: { discordId: '777' },
            })
        })

        it('getTrackHistory passes where/orderBy/take to findMany', async () => {
            mockTrackHistoryFindMany.mockResolvedValue([])

            await service.getTrackHistory('777', 7)

            expect(mockTrackHistoryFindMany).toHaveBeenCalledWith({
                where: { guild: { discordId: '777' } },
                orderBy: { playedAt: 'desc' },
                take: 7,
            })
        })

        it('getTopTracks passes by/where/_count/orderBy/take to groupBy', async () => {
            mockTrackHistoryGroupBy.mockResolvedValue([])

            await service.getTopTracks('777', 9)

            expect(mockTrackHistoryGroupBy).toHaveBeenCalledWith({
                by: ['trackId', 'title', 'author'],
                where: { guild: { discordId: '777' } },
                _count: { trackId: true },
                orderBy: { _count: { trackId: 'desc' } },
                take: 9,
            })
        })

        it('getTopArtists passes by/where/_count/orderBy/take to groupBy', async () => {
            mockTrackHistoryGroupBy.mockResolvedValue([])

            await service.getTopArtists('777', 4)

            expect(mockTrackHistoryGroupBy).toHaveBeenCalledWith({
                by: ['author'],
                where: { guild: { discordId: '777' } },
                _count: { author: true },
                orderBy: { _count: { author: 'desc' } },
                take: 4,
            })
        })

        it('cleanupOldData deletes by playedAt and resetAt cutoffs and sums counts', async () => {
            mockTrackHistoryDeleteMany.mockResolvedValue({ count: 3 })
            mockRateLimitDeleteMany.mockResolvedValue({ count: 2 })

            const result = await service.cleanupOldData()

            // 3 + 2 = 5 (kills the + -> - arithmetic mutant)
            expect(result.getData()).toBe(5)
            expect(mockTrackHistoryDeleteMany).toHaveBeenCalledWith({
                where: { playedAt: { lt: expect.any(Date) } },
            })
            expect(mockRateLimitDeleteMany).toHaveBeenCalledWith({
                where: { resetAt: { lt: expect.any(Date) } },
            })
        })
    })

    describe('default values (kill BooleanLiteral mutants)', () => {
        const trackRow = {
            id: 't1',
            guildId: 'g1',
            trackId: 'yt-1',
            title: 'Song',
            author: 'Artist',
            duration: '3:00',
            url: 'http://x',
            thumbnail: null,
            source: 'youtube',
            playedAt: new Date(),
            createdAt: new Date(),
            playedBy: null,
            isAutoplay: false,
            playlistName: null,
            playDuration: null,
            skipped: null,
            isPlaylist: null,
        }
        const baseTrack = {
            guildId: 'g1',
            trackId: 'yt-1',
            title: 'Song',
            author: 'Artist',
            duration: '3:00',
            url: 'http://x',
            source: 'youtube',
        }

        it('defaults isAutoplay to false when omitted', async () => {
            mockTrackHistoryCreate.mockResolvedValue(trackRow)

            await service.addTrackToHistory(baseTrack)

            expect(mockTrackHistoryCreate).toHaveBeenCalledWith({
                data: expect.objectContaining({ isAutoplay: false }),
            })
        })

        it('passes isAutoplay true through when provided', async () => {
            mockTrackHistoryCreate.mockResolvedValue({
                ...trackRow,
                isAutoplay: true,
            })

            await service.addTrackToHistory({ ...baseTrack, isAutoplay: true })

            expect(mockTrackHistoryCreate).toHaveBeenCalledWith({
                data: expect.objectContaining({ isAutoplay: true }),
            })
        })

        it('returns true (not the connect side effect) when already connected', async () => {
            mockConnect.mockResolvedValue(undefined)
            await service.connect()
            mockConnect.mockClear()

            const result = await service.connect()

            expect(result.getData()).toBe(true)
            expect(mockConnect).not.toHaveBeenCalled()
        })
    })

    describe('rate-limit branches (kill conditional/boundary mutants)', () => {
        it('creates a fresh window when no record exists', async () => {
            mockRateLimitFindUnique.mockResolvedValue(null)
            mockRateLimitUpsert.mockResolvedValue({})

            const result = await service.checkRateLimit('k', 5, 60000)

            expect(result.getData()).toBe(true)
            expect(mockRateLimitUpsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { key: 'k' },
                    update: expect.objectContaining({ count: 1 }),
                    create: expect.objectContaining({ key: 'k', count: 1 }),
                }),
            )
        })

        it('resets the window when the existing record has expired', async () => {
            mockRateLimitFindUnique.mockResolvedValue({
                resetAt: new Date(Date.now() - 1000),
                count: 99,
            })
            mockRateLimitUpsert.mockResolvedValue({})

            const result = await service.checkRateLimit('k', 5, 60000)

            expect(result.getData()).toBe(true)
            expect(mockRateLimitUpsert).toHaveBeenCalled()
        })

        it('denies at the limit boundary (count === limit) without updating', async () => {
            mockRateLimitFindUnique.mockResolvedValue({
                resetAt: new Date(Date.now() + 60000),
                count: 5,
            })

            const result = await service.checkRateLimit('k', 5, 60000)

            expect(result.getData()).toBe(false)
            expect(mockRateLimitUpdate).not.toHaveBeenCalled()
        })

        it('increments by one just under the limit (count === limit - 1)', async () => {
            mockRateLimitFindUnique.mockResolvedValue({
                resetAt: new Date(Date.now() + 60000),
                count: 4,
            })
            mockRateLimitUpdate.mockResolvedValue({})

            const result = await service.checkRateLimit('k', 5, 60000)

            expect(result.getData()).toBe(true)
            expect(mockRateLimitUpdate).toHaveBeenCalledWith({
                where: { key: 'k' },
                data: { count: 5 },
            })
        })
    })

    describe('validation guards (kill type-guard mutants)', () => {
        it('createUser fails when upsert returns an object missing id', async () => {
            mockUserUpsert.mockResolvedValue({ discordId: '123' })

            const result = await service.createUser('123', 'bob')

            expect(result.isFailure()).toBe(true)
        })

        it('createUser fails when upsert returns an object missing discordId', async () => {
            mockUserUpsert.mockResolvedValue({ id: 'u1' })

            const result = await service.createUser('123', 'bob')

            expect(result.isFailure()).toBe(true)
        })

        it('createUser fails when upsert returns a non-object', async () => {
            mockUserUpsert.mockResolvedValue('not-an-object')

            const result = await service.createUser('123', 'bob')

            expect(result.isFailure()).toBe(true)
        })

        it('getUser fails when findUnique returns an object missing discordId', async () => {
            mockUserFindUnique.mockResolvedValue({ id: 'u1' })

            const result = await service.getUser('123')

            expect(result.isFailure()).toBe(true)
        })

        it('createGuild fails when upsert returns an object missing discordId', async () => {
            mockGuildUpsert.mockResolvedValue({ id: 'g1' })

            const result = await service.createGuild('777', 'G', 'owner')

            expect(result.isFailure()).toBe(true)
        })

        it('addTrackToHistory fails when create returns an object missing trackId', async () => {
            mockTrackHistoryCreate.mockResolvedValue({ id: 't1' })

            const result = await service.addTrackToHistory({
                guildId: 'g1',
                trackId: 'yt-1',
                title: 'S',
                author: 'A',
                duration: '1',
                url: 'u',
                source: 'youtube',
            })

            expect(result.isFailure()).toBe(true)
        })

        it('getTrackHistory fails when findMany returns a non-array', async () => {
            mockTrackHistoryFindMany.mockResolvedValue({ not: 'array' })

            const result = await service.getTrackHistory('777')

            expect(result.isFailure()).toBe(true)
        })

        it('checkRateLimit fails when the record is missing resetAt', async () => {
            mockRateLimitFindUnique.mockResolvedValue({ count: 3 })

            const result = await service.checkRateLimit('k', 5, 60000)

            expect(result.isFailure()).toBe(true)
        })

        it('checkRateLimit fails when resetAt is not a Date', async () => {
            mockRateLimitFindUnique.mockResolvedValue({
                resetAt: 'soon',
                count: 3,
            })

            const result = await service.checkRateLimit('k', 5, 60000)

            expect(result.isFailure()).toBe(true)
        })

        it('checkRateLimit fails when count is not a number', async () => {
            mockRateLimitFindUnique.mockResolvedValue({
                resetAt: new Date(Date.now() + 60000),
                count: 'three',
            })

            const result = await service.checkRateLimit('k', 5, 60000)

            expect(result.isFailure()).toBe(true)
        })

        it('getTopTracks filters out malformed group rows', async () => {
            mockTrackHistoryGroupBy.mockResolvedValue([
                {
                    trackId: 't1',
                    title: 'S',
                    author: 'A',
                    _count: { trackId: 5 },
                },
                { trackId: 't2' }, // malformed: missing title/author/_count
            ])

            const result = await service.getTopTracks('777')

            expect(result.getData()).toHaveLength(1)
        })
    })

    describe('error labels (kill operation-name StringLiteral mutants)', () => {
        it('logs the create_user label on failure', async () => {
            mockUserUpsert.mockRejectedValue(new Error('boom'))

            await service.createUser('123', 'bob')

            expect(jest.mocked(errorLog)).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'create_user failed' }),
            )
        })

        it('logs the get_top_tracks label on failure', async () => {
            mockTrackHistoryGroupBy.mockRejectedValue(new Error('boom'))

            await service.getTopTracks('777')

            expect(jest.mocked(errorLog)).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'get_top_tracks failed' }),
            )
        })

        it('logs the cleanup_old_data label on failure', async () => {
            mockTrackHistoryDeleteMany.mockRejectedValue(new Error('boom'))
            mockRateLimitDeleteMany.mockResolvedValue({ count: 0 })

            await service.cleanupOldData()

            expect(jest.mocked(errorLog)).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'cleanup_old_data failed' }),
            )
        })

        it('logs the database_connect label on failure', async () => {
            mockConnect.mockRejectedValue(new Error('boom'))

            await service.connect()

            expect(jest.mocked(errorLog)).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'database_connect failed' }),
            )
        })

        it('logs the database_disconnect label on failure', async () => {
            mockConnect.mockResolvedValue(undefined)
            await service.connect()
            mockDisconnect.mockRejectedValue(new Error('boom'))

            await service.disconnect()

            expect(jest.mocked(errorLog)).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'database_disconnect failed',
                }),
            )
        })

        it('logs the database_health_check label on failure', async () => {
            mockConnect.mockResolvedValue(undefined)
            await service.connect()
            mockQueryRaw.mockRejectedValue(new Error('boom'))

            await service.isHealthy()

            expect(jest.mocked(errorLog)).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'database_health_check failed',
                }),
            )
        })

        it('logs the get_user label on failure', async () => {
            mockUserFindUnique.mockRejectedValue(new Error('boom'))

            await service.getUser('123')

            expect(jest.mocked(errorLog)).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'get_user failed' }),
            )
        })

        it('logs the create_guild label on failure', async () => {
            mockGuildUpsert.mockRejectedValue(new Error('boom'))

            await service.createGuild('777', 'G', 'owner')

            expect(jest.mocked(errorLog)).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'create_guild failed' }),
            )
        })

        it('logs the get_guild label on failure', async () => {
            mockGuildFindUnique.mockRejectedValue(new Error('boom'))

            await service.getGuild('777')

            expect(jest.mocked(errorLog)).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'get_guild failed' }),
            )
        })

        it('logs the add_track_to_history label on failure', async () => {
            mockTrackHistoryCreate.mockRejectedValue(new Error('boom'))

            await service.addTrackToHistory({
                guildId: 'g1',
                trackId: 'yt-1',
                title: 'S',
                author: 'A',
                duration: '1',
                url: 'u',
                source: 'youtube',
            })

            expect(jest.mocked(errorLog)).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'add_track_to_history failed',
                }),
            )
        })

        it('logs the get_track_history label on failure', async () => {
            mockTrackHistoryFindMany.mockRejectedValue(new Error('boom'))

            await service.getTrackHistory('777')

            expect(jest.mocked(errorLog)).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'get_track_history failed',
                }),
            )
        })

        it('logs the check_rate_limit label on failure', async () => {
            mockRateLimitFindUnique.mockRejectedValue(new Error('boom'))

            await service.checkRateLimit('k', 5, 60000)

            expect(jest.mocked(errorLog)).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'check_rate_limit failed' }),
            )
        })

        it('logs the get_top_artists label on failure', async () => {
            mockTrackHistoryGroupBy.mockRejectedValue(new Error('boom'))

            await service.getTopArtists('777')

            expect(jest.mocked(errorLog)).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'get_top_artists failed' }),
            )
        })
    })

    describe('more malformed inputs (kill remaining guard mutants)', () => {
        it('getUser fails when findUnique returns a non-object', async () => {
            mockUserFindUnique.mockResolvedValue(42)

            const result = await service.getUser('123')

            expect(result.isFailure()).toBe(true)
        })

        it('createGuild fails when upsert returns a non-object', async () => {
            mockGuildUpsert.mockResolvedValue('nope')

            const result = await service.createGuild('777', 'G', 'owner')

            expect(result.isFailure()).toBe(true)
        })

        it('createGuild fails when upsert returns an object missing id', async () => {
            mockGuildUpsert.mockResolvedValue({ discordId: '777' })

            const result = await service.createGuild('777', 'G', 'owner')

            expect(result.isFailure()).toBe(true)
        })

        it('addTrackToHistory fails when create returns a non-object', async () => {
            mockTrackHistoryCreate.mockResolvedValue(null)

            const result = await service.addTrackToHistory({
                guildId: 'g1',
                trackId: 'yt-1',
                title: 'S',
                author: 'A',
                duration: '1',
                url: 'u',
                source: 'youtube',
            })

            expect(result.isFailure()).toBe(true)
        })

        it('getTopArtists filters out malformed group rows', async () => {
            mockTrackHistoryGroupBy.mockResolvedValue([
                { author: 'A', _count: { author: 3 } },
                { author: 'B' }, // malformed: missing _count
            ])

            const result = await service.getTopArtists('777')

            expect(result.getData()).toHaveLength(1)
        })
    })
})
