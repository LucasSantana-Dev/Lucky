import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { GuildQueue } from 'discord-player'
import { getPrismaClient } from '@lucky/shared/utils'
import { NamedSessionService } from './namedSessions'

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: jest.fn(),
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('./sessionSnapshots', () => ({
    toSnapshotTrack: (track: unknown) => {
        const t = track as any
        return {
            title: t.title,
            author: t.author,
            url: t.url,
            duration: '3:00',
            source: 'spotify',
            recommendationReason: t.metadata?.recommendationReason,
            isAutoplay: t.metadata?.isAutoplay,
            requestedById: t.metadata?.requestedById,
        }
    },
}))

const mockGetPrismaClient = jest.mocked(getPrismaClient)
const mockCount = jest.fn<any>()
const mockFindUnique = jest.fn<any>()
const mockCreate = jest.fn<any>()
const mockFindMany = jest.fn<any>()
const mockDeleteMany = jest.fn<any>()

/** Builds a `named_queues` row for mock returns. */
function row(overrides: Record<string, unknown> = {}) {
    return {
        id: 'row-1',
        name: 'party-mix',
        guildId: 'guild-1',
        savedBy: 'user-1',
        savedAt: new Date(),
        trackCount: 2,
        voiceChannelId: null,
        currentTrack: {
            title: 'Song 1',
            author: 'Artist',
            url: 'https://example.com/1',
            duration: '3:00',
            source: 'spotify',
        },
        upcomingTracks: [
            {
                title: 'Song 2',
                author: 'Artist',
                url: 'https://example.com/2',
                duration: '3:00',
                source: 'spotify',
            },
        ],
        ...overrides,
    }
}

function createTrack(id: string, title: string) {
    return {
        id,
        title,
        author: 'Artist',
        url: `https://example.com/${id}`,
        duration: 180000,
        metadata: {},
        setMetadata: jest.fn(),
    } as any
}

function createQueue(trackCount = 5) {
    const tracks = Array.from({ length: trackCount }, (_, i) =>
        createTrack(`track-${i}`, `Song ${i}`),
    )
    return {
        guild: { id: 'guild-1' },
        currentTrack: tracks[0],
        tracks: {
            toArray: jest.fn(() => tracks.slice(1)),
        },
        channel: { id: 'voice-channel-1' },
        player: {
            search: jest.fn(async () => ({
                tracks: [createTrack('found', 'Found Track')],
            })),
        },
        node: {
            isPlaying: jest.fn(() => false),
            play: jest.fn(),
        },
        addTrack: jest.fn(),
    } as any
}

describe('NamedSessionService', () => {
    let service: NamedSessionService
    let queue: GuildQueue

    beforeEach(() => {
        jest.clearAllMocks()
        service = new NamedSessionService()
        queue = createQueue()
        mockGetPrismaClient.mockReturnValue({
            namedQueue: {
                count: mockCount,
                findUnique: mockFindUnique,
                create: mockCreate,
                findMany: mockFindMany,
                deleteMany: mockDeleteMany,
            },
        } as any)
        mockCount.mockResolvedValue(0)
        mockFindUnique.mockResolvedValue(null)
        mockCreate.mockResolvedValue(row())
        mockFindMany.mockResolvedValue([])
        mockDeleteMany.mockResolvedValue({ count: 1 })
    })

    describe('save', () => {
        it('saves a session with valid name and data', async () => {
            const session = await service.save(queue, 'party-mix', 'user-1')

            expect(session).not.toBeNull()
            expect(session?.name).toBe('party-mix')
            expect(session?.guildId).toBe('guild-1')
            expect(session?.savedBy).toBe('user-1')
            expect(session?.trackCount).toBeGreaterThan(0)
            expect(mockCreate).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    guildId: 'guild-1',
                    name: 'party-mix',
                    savedBy: 'user-1',
                    voiceChannelId: 'voice-channel-1',
                    trackCount: expect.any(Number),
                    upcomingTracks: expect.any(Array),
                }),
            })
        })

        it.each([
            {
                name: 'invalid name!',
                setup: () => {},
                desc: 'invalid name format',
            },
            {
                name: 'party-mix',
                setup: () => mockFindUnique.mockResolvedValueOnce(row()),
                desc: 'session already exists',
            },
            {
                name: 'party-mix',
                setup: () => mockCount.mockResolvedValueOnce(10),
                desc: 'max sessions reached',
            },
        ])('rejects if $desc', async ({ name, setup }) => {
            setup()
            const session = await service.save(queue, name, 'user-1')
            expect(session).toBeNull()
            expect(mockCreate).not.toHaveBeenCalled()
        })

        it('returns null if queue is empty', async () => {
            const emptyQueue = createQueue(0)
            emptyQueue.currentTrack = null
            const session = await service.save(
                emptyQueue,
                'party-mix',
                'user-1',
            )
            expect(session).toBeNull()
        })
    })

    describe('restore', () => {
        it.each([{ found: true }, { found: false }])(
            'restores session or returns 0 when not found',
            async ({ found }) => {
                if (found) {
                    mockFindUnique.mockResolvedValueOnce(row())
                    const result = await service.restore(queue, 'party-mix')
                    expect(result.restoredCount).toBeGreaterThan(0)
                    expect(queue.addTrack).toHaveBeenCalled()
                    expect(queue.node.play).toHaveBeenCalled()
                } else {
                    mockFindUnique.mockResolvedValueOnce(null)
                    const result = await service.restore(queue, 'nonexistent')
                    expect(result.restoredCount).toBe(0)
                }
            },
        )
    })

    describe('list', () => {
        it('maps rows to summaries (newest-first, TTL-filtered query)', async () => {
            const now = Date.now()
            mockFindMany.mockResolvedValueOnce([
                row({
                    name: 'session-2',
                    savedBy: 'user-2',
                    savedAt: new Date(now),
                    trackCount: 3,
                }),
                row({
                    name: 'session-1',
                    savedBy: 'user-1',
                    savedAt: new Date(now - 1000),
                    trackCount: 5,
                }),
            ])

            const list = await service.list('guild-1')

            expect(list).toHaveLength(2)
            expect(list[0].name).toBe('session-2')
            expect(mockFindMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        guildId: 'guild-1',
                        savedAt: { gte: expect.any(Date) },
                    },
                    orderBy: { savedAt: 'desc' },
                }),
            )
        })
    })

    describe('delete', () => {
        it('deletes the row by guild + name and reports success', async () => {
            mockDeleteMany.mockResolvedValueOnce({ count: 1 })
            expect(await service.delete('guild-1', 'party-mix')).toBe(true)
            expect(mockDeleteMany).toHaveBeenCalledWith({
                where: { guildId: 'guild-1', name: 'party-mix' },
            })
        })

        it('reports failure when nothing was deleted', async () => {
            mockDeleteMany.mockResolvedValueOnce({ count: 0 })
            expect(await service.delete('guild-1', 'missing')).toBe(false)
        })
    })

    describe('get', () => {
        it('retrieves and maps a session by guildId and name', async () => {
            mockFindUnique.mockResolvedValueOnce(
                row({ currentTrack: null, upcomingTracks: [] }),
            )
            const session = await service.get('guild-1', 'party-mix')
            expect(session).toMatchObject({
                name: 'party-mix',
                guildId: 'guild-1',
                savedBy: 'user-1',
                currentTrack: null,
                upcomingTracks: [],
            })
        })

        it('treats a row older than the TTL as absent and prunes it', async () => {
            mockFindUnique.mockResolvedValueOnce(
                row({
                    savedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
                }),
            )
            const session = await service.get('guild-1', 'party-mix')
            expect(session).toBeNull()
            expect(mockDeleteMany).toHaveBeenCalledWith({
                where: { guildId: 'guild-1', name: 'party-mix' },
            })
        })
    })

    describe('name validation', () => {
        it('accepts valid names', async () => {
            const session = await service.save(queue, 'party-mix', 'user-1')
            expect(session).not.toBeNull()
        })

        it.each(['party mix', 'party@mix', ''])(
            'rejects invalid name: %s',
            async (name) => {
                const session = await service.save(queue, name, 'user-1')
                expect(session).toBeNull()
            },
        )
    })
})
