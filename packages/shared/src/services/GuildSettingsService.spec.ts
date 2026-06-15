import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockFindUnique = jest.fn<any>()
const mockUpsert = jest.fn<any>()
const mockUpdateMany = jest.fn<any>()
const mockGetPrismaClient = jest.fn<any>()

jest.mock('../utils/database/prismaClient', () => ({
    getPrismaClient: mockGetPrismaClient,
    disconnectPrisma: jest.fn(),
}))

jest.mock('./redis', () => ({
    redisClient: {
        get: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
    },
}))

import { GuildSettingsService } from './GuildSettingsService'

const GUILD = 'guild-1'

describe('GuildSettingsService — counters (Postgres) + rate limit (in-memory)', () => {
    let service: GuildSettingsService

    beforeEach(() => {
        jest.clearAllMocks()
        mockGetPrismaClient.mockReturnValue({
            guildCounter: {
                findUnique: mockFindUnique,
                upsert: mockUpsert,
                updateMany: mockUpdateMany,
            },
        })
        service = new GuildSettingsService()
    })

    describe('autoplay counter', () => {
        it('maps a row to AutoplayCounter, or null when absent', async () => {
            const lastReset = new Date('2026-05-31T00:00:00Z')
            mockFindUnique
                .mockResolvedValueOnce({
                    autoplayCount: 4,
                    autoplayLastReset: lastReset,
                })
                .mockResolvedValueOnce(null)

            expect(await service.getAutoplayCounter(GUILD)).toEqual({
                guildId: GUILD,
                count: 4,
                lastReset,
            })
            expect(await service.getAutoplayCounter(GUILD)).toBeNull()
        })

        it('increments atomically via upsert and returns the new count', async () => {
            mockUpsert.mockResolvedValue({ autoplayCount: 5 })

            expect(await service.incrementAutoplayCounter(GUILD)).toBe(5)
            expect(mockUpsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { guildId: GUILD },
                    create: { guildId: GUILD, autoplayCount: 1 },
                    update: { autoplayCount: { increment: 1 } },
                }),
            )
        })

        it('resets the counter to zero', async () => {
            mockUpsert.mockResolvedValue({ autoplayCount: 0 })
            expect(await service.resetAutoplayCounter(GUILD)).toBe(true)
            expect(mockUpsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    update: expect.objectContaining({ autoplayCount: 0 }),
                }),
            )
        })

        it('returns 0 on increment error', async () => {
            mockUpsert.mockRejectedValueOnce(new Error('db down'))
            expect(await service.incrementAutoplayCounter(GUILD)).toBe(0)
        })

        it('returns false when reset fails with a Prisma error (code + meta)', async () => {
            mockUpsert.mockRejectedValueOnce({
                name: 'PrismaClientKnownRequestError',
                code: 'P2003',
                meta: { field_name: 'guildId' },
                message: 'Invalid invocation',
            })
            expect(await service.resetAutoplayCounter(GUILD)).toBe(false)
        })

        it('returns false when reset fails with a non-Prisma error', async () => {
            mockUpsert.mockRejectedValueOnce(new Error('db down'))
            expect(await service.resetAutoplayCounter(GUILD)).toBe(false)
        })
    })

    describe('repeat counter', () => {
        it('reads the repeat count (0 when no row)', async () => {
            mockFindUnique
                .mockResolvedValueOnce({ repeatCount: 3 })
                .mockResolvedValueOnce(null)
            expect(await service.getRepeatCount(GUILD)).toBe(3)
            expect(await service.getRepeatCount(GUILD)).toBe(0)
        })

        it('increments the repeat count via upsert', async () => {
            mockUpsert.mockResolvedValue({ repeatCount: 2 })
            expect(await service.incrementRepeatCount(GUILD)).toBe(2)
            expect(mockUpsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    update: { repeatCount: { increment: 1 } },
                }),
            )
        })

        it('resets the repeat count to zero', async () => {
            mockUpsert.mockResolvedValue({ repeatCount: 0 })
            expect(await service.resetRepeatCount(GUILD)).toBe(true)
        })
    })

    describe('clearAllAutoplayCounters', () => {
        it('zeroes every guild counter via updateMany', async () => {
            mockUpdateMany.mockResolvedValue({ count: 9 })
            expect(await service.clearAllAutoplayCounters()).toBe(true)
            expect(mockUpdateMany).toHaveBeenCalledWith({
                data: { autoplayCount: 0, autoplayLastReset: expect.any(Date) },
            })
        })

        it('returns false on error', async () => {
            mockUpdateMany.mockRejectedValueOnce(new Error('db down'))
            expect(await service.clearAllAutoplayCounters()).toBe(false)
        })
    })

    describe('rate limiting (in-memory)', () => {
        it('allows the first use then blocks within the cooldown window', async () => {
            expect(await service.isRateLimited(GUILD, 'play', 60)).toBe(false)
            expect(await service.isRateLimited(GUILD, 'play', 60)).toBe(true)
        })

        it('scopes cooldowns per command', async () => {
            await service.isRateLimited(GUILD, 'play', 60)
            expect(await service.isRateLimited(GUILD, 'skip', 60)).toBe(false)
        })

        it('does not touch the database for rate limiting', async () => {
            await service.isRateLimited(GUILD, 'play', 60)
            await service.setRateLimit(GUILD, 'play', 60)
            expect(mockGetPrismaClient).not.toHaveBeenCalled()
        })
    })
})

// #1426 widening: the settings CRUD + several counter methods had near-zero
// coverage (the private toPrismaData/rowToSettings mappers drove most of the
// surviving mutants). These assert the exact prisma upsert/find/delete clauses,
// the full row->settings mapping incl. null fallbacks, and the delegation logic.
describe('GuildSettingsService — settings CRUD + counter methods', () => {
    const sFindUnique = jest.fn<any>()
    const sUpsert = jest.fn<any>()
    const sDeleteMany = jest.fn<any>()
    const cFindUnique = jest.fn<any>()
    const cUpsert = jest.fn<any>()
    let service: GuildSettingsService

    beforeEach(() => {
        jest.clearAllMocks()
        mockGetPrismaClient.mockReturnValue({
            guildSettings: {
                findUnique: sFindUnique,
                upsert: sUpsert,
                deleteMany: sDeleteMany,
            },
            guildCounter: { findUnique: cFindUnique, upsert: cUpsert },
        })
        service = new GuildSettingsService()
    })

    function settingsRow(overrides: Record<string, unknown> = {}) {
        return {
            guildId: GUILD,
            defaultVolume: 70,
            maxQueueSize: 200,
            autoPlayEnabled: false,
            autoplayMode: 'discover',
            autoplayGenres: ['rock'],
            blockSertanejo: false,
            repeatMode: 2,
            shuffleEnabled: true,
            prefix: '!',
            embedColor: '0x111',
            language: 'pt',
            allowDownloads: false,
            allowPlaylists: false,
            allowSpotify: false,
            commandCooldown: 9,
            downloadCooldown: 99,
            djRoleId: 'dj-1',
            idleTimeoutMinutes: 15,
            voteSkipThreshold: 60,
            createdAt: new Date('2026-01-01'),
            updatedAt: new Date('2026-02-01'),
            ...overrides,
        }
    }

    describe('getGuildSettings', () => {
        it('maps a full row to settings and queries by guildId', async () => {
            sFindUnique.mockResolvedValue(settingsRow())

            const s = await service.getGuildSettings(GUILD)

            expect(sFindUnique).toHaveBeenCalledWith({
                where: { guildId: GUILD },
            })
            expect(s).toMatchObject({
                guildId: GUILD,
                defaultVolume: 70,
                maxQueueSize: 200,
                autoplayMode: 'discover',
                autoplayGenres: ['rock'],
                repeatMode: 2,
                language: 'pt',
                djRoleId: 'dj-1',
                voteSkipThreshold: 60,
            })
        })

        it('applies defaults for null prefix/embedColor/djRoleId/idle/vote', async () => {
            sFindUnique.mockResolvedValue(
                settingsRow({
                    prefix: null,
                    embedColor: null,
                    djRoleId: null,
                    idleTimeoutMinutes: null,
                    voteSkipThreshold: null,
                }),
            )

            const s = await service.getGuildSettings(GUILD)

            expect(s?.prefix).toBe('/')
            expect(s?.embedColor).toBe('0x5865F2')
            expect(s?.djRoleId).toBeUndefined()
            expect(s?.idleTimeoutMinutes).toBe(0)
            expect(s?.voteSkipThreshold).toBe(50)
        })

        it('defaults blockSertanejo to true when the row value is nullish', async () => {
            sFindUnique.mockResolvedValue(settingsRow({ blockSertanejo: null }))
            const s = await service.getGuildSettings(GUILD)
            expect(s?.blockSertanejo).toBe(true)
        })

        it('returns null when no row and on error', async () => {
            sFindUnique.mockResolvedValue(null)
            expect(await service.getGuildSettings(GUILD)).toBeNull()
            sFindUnique.mockRejectedValue(new Error('db'))
            expect(await service.getGuildSettings(GUILD)).toBeNull()
        })
    })

    describe('setGuildSettings', () => {
        it('upserts only the provided fields (undefined omitted) on create + update', async () => {
            sUpsert.mockResolvedValue({})

            const ok = await service.setGuildSettings(GUILD, {
                defaultVolume: 80,
                language: 'pt',
                shuffleEnabled: true,
            })

            expect(ok).toBe(true)
            const data = {
                defaultVolume: 80,
                language: 'pt',
                shuffleEnabled: true,
            }
            expect(sUpsert).toHaveBeenCalledWith({
                where: { guildId: GUILD },
                create: { guildId: GUILD, ...data },
                update: data,
            })
            // maxQueueSize was not provided → must NOT appear in the data
            const passed = (sUpsert.mock.calls[0][0] as { update: object })
                .update
            expect('maxQueueSize' in passed).toBe(false)
        })

        it('copies every provided field into the upsert data', async () => {
            sUpsert.mockResolvedValue({})
            const full: Parameters<typeof service.setGuildSettings>[1] = {
                defaultVolume: 70,
                maxQueueSize: 200,
                autoPlayEnabled: false,
                autoplayMode: 'discover',
                autoplayGenres: ['rock'],
                blockSertanejo: false,
                repeatMode: 2,
                shuffleEnabled: true,
                prefix: '!',
                embedColor: '0x111',
                language: 'pt',
                allowDownloads: false,
                allowPlaylists: false,
                allowSpotify: false,
                commandCooldown: 9,
                downloadCooldown: 99,
                djRoleId: 'dj-1',
                idleTimeoutMinutes: 15,
                voteSkipThreshold: 60,
            }

            await service.setGuildSettings(GUILD, full)

            expect(sUpsert).toHaveBeenCalledWith({
                where: { guildId: GUILD },
                create: { guildId: GUILD, ...full },
                update: full,
            })
        })

        it('returns false on error', async () => {
            sUpsert.mockRejectedValue(new Error('db'))
            expect(await service.setGuildSettings(GUILD, {})).toBe(false)
        })
    })

    describe('deleteGuildSettings', () => {
        it('deletes by guildId and returns true; false on error', async () => {
            sDeleteMany.mockResolvedValue({ count: 1 })
            expect(await service.deleteGuildSettings(GUILD)).toBe(true)
            expect(sDeleteMany).toHaveBeenCalledWith({
                where: { guildId: GUILD },
            })
            sDeleteMany.mockRejectedValue(new Error('db'))
            expect(await service.deleteGuildSettings(GUILD)).toBe(false)
        })
    })

    describe('autoplay + repeat counters', () => {
        it('getAutoplayCounter maps the row or returns null', async () => {
            const lastReset = new Date('2026-03-01')
            cFindUnique.mockResolvedValue({
                autoplayCount: 7,
                autoplayLastReset: lastReset,
            })
            expect(await service.getAutoplayCounter(GUILD)).toEqual({
                guildId: GUILD,
                count: 7,
                lastReset,
            })
            cFindUnique.mockResolvedValue(null)
            expect(await service.getAutoplayCounter(GUILD)).toBeNull()
        })

        it('setAutoplayCounter upserts count + lastReset', async () => {
            const lastReset = new Date('2026-03-01')
            cUpsert.mockResolvedValue({})
            const ok = await service.setAutoplayCounter(GUILD, {
                guildId: GUILD,
                count: 5,
                lastReset,
            })
            expect(ok).toBe(true)
            expect(cUpsert).toHaveBeenCalledWith({
                where: { guildId: GUILD },
                create: {
                    guildId: GUILD,
                    autoplayCount: 5,
                    autoplayLastReset: lastReset,
                },
                update: { autoplayCount: 5, autoplayLastReset: lastReset },
            })
        })

        it('getRepeatCount returns the row value or 0', async () => {
            cFindUnique.mockResolvedValue({ repeatCount: 4 })
            expect(await service.getRepeatCount(GUILD)).toBe(4)
            cFindUnique.mockResolvedValue(null)
            expect(await service.getRepeatCount(GUILD)).toBe(0)
        })

        it('setRepeatCount upserts the count', async () => {
            cUpsert.mockResolvedValue({})
            expect(await service.setRepeatCount(GUILD, 3)).toBe(true)
            expect(cUpsert).toHaveBeenCalledWith({
                where: { guildId: GUILD },
                create: { guildId: GUILD, repeatCount: 3 },
                update: { repeatCount: 3 },
            })
        })

        it('incrementRepeatCount upserts with increment and returns the value', async () => {
            cUpsert.mockResolvedValue({ repeatCount: 8 })
            expect(await service.incrementRepeatCount(GUILD)).toBe(8)
            expect(cUpsert).toHaveBeenCalledWith({
                where: { guildId: GUILD },
                create: { guildId: GUILD, repeatCount: 1 },
                update: { repeatCount: { increment: 1 } },
            })
        })

        it('resetRepeatCount sets the count to 0', async () => {
            cUpsert.mockResolvedValue({})
            expect(await service.resetRepeatCount(GUILD)).toBe(true)
            expect(cUpsert).toHaveBeenCalledWith(
                expect.objectContaining({ update: { repeatCount: 0 } }),
            )
        })
    })

    describe('clearGuildSessions', () => {
        it('returns true only when settings delete + both resets succeed', async () => {
            sDeleteMany.mockResolvedValue({ count: 1 })
            cUpsert.mockResolvedValue({})
            expect(await service.clearGuildSessions(GUILD)).toBe(true)
        })

        it('returns false when the settings delete fails', async () => {
            sDeleteMany.mockRejectedValue(new Error('db'))
            cUpsert.mockResolvedValue({})
            expect(await service.clearGuildSessions(GUILD)).toBe(false)
        })
    })
})
