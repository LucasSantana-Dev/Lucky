import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { GuildQueue } from 'discord-player'
import { NamedSessionService } from './namedSessions'

const redisClientMock = {
    scard: jest.fn(),
    sadd: jest.fn(),
    srem: jest.fn(),
    setex: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    smembers: jest.fn(),
}

const debugLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    redisClient: redisClientMock,
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
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
        redisClientMock.scard.mockResolvedValue(0)
        redisClientMock.exists.mockResolvedValue(0)
        redisClientMock.setex.mockResolvedValue('OK')
        redisClientMock.sadd.mockResolvedValue(1)
        redisClientMock.del.mockResolvedValue(1)
        redisClientMock.srem.mockResolvedValue(1)
    })

    describe('save', () => {
        it('saves a session with valid name and data', async () => {
            const session = await service.save(queue, 'party-mix', 'user-1')

            expect(session).not.toBeNull()
            expect(session?.name).toBe('party-mix')
            expect(session?.guildId).toBe('guild-1')
            expect(session?.savedBy).toBe('user-1')
            expect(session?.trackCount).toBeGreaterThan(0)
        })

        it('rejects invalid name format', async () => {
            const session = await service.save(queue, 'invalid name!', 'user-1')
            expect(session).toBeNull()
        })

        it('rejects if session already exists', async () => {
            redisClientMock.exists.mockResolvedValueOnce(1)
            const session = await service.save(queue, 'party-mix', 'user-1')
            expect(session).toBeNull()
        })

        it('rejects if max sessions reached', async () => {
            redisClientMock.scard.mockResolvedValueOnce(10)
            const session = await service.save(queue, 'party-mix', 'user-1')
            expect(session).toBeNull()
        })

        it('returns null if queue is empty', async () => {
            const emptyQueue = createQueue(0)
            emptyQueue.currentTrack = null
            const session = await service.save(emptyQueue, 'party-mix', 'user-1')
            expect(session).toBeNull()
        })

        it('sets TTL correctly on save', async () => {
            await service.save(queue, 'party-mix', 'user-1')
            expect(redisClientMock.setex).toHaveBeenCalledWith(
                expect.stringContaining('music:named-session'),
                30 * 24 * 60 * 60,
                expect.any(String),
            )
        })

        it('adds session name to index set', async () => {
            await service.save(queue, 'party-mix', 'user-1')
            expect(redisClientMock.sadd).toHaveBeenCalledWith(
                'music:named-sessions:guild-1',
                'party-mix',
            )
        })
    })

    describe('restore', () => {
        it('restores tracks from saved session', async () => {
            redisClientMock.get.mockResolvedValueOnce(
                JSON.stringify({
                    name: 'party-mix',
                    guildId: 'guild-1',
                    savedBy: 'user-1',
                    savedAt: Date.now(),
                    trackCount: 2,
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
                }),
            )

            const result = await service.restore(queue, 'party-mix')
            expect(result.restoredCount).toBeGreaterThan(0)
            expect(queue.addTrack).toHaveBeenCalled()
        })

        it('plays queue if not already playing', async () => {
            redisClientMock.get.mockResolvedValueOnce(
                JSON.stringify({
                    name: 'party-mix',
                    guildId: 'guild-1',
                    savedBy: 'user-1',
                    savedAt: Date.now(),
                    trackCount: 1,
                    currentTrack: {
                        title: 'Song 1',
                        author: 'Artist',
                        url: 'https://example.com/1',
                        duration: '3:00',
                        source: 'spotify',
                    },
                    upcomingTracks: [],
                }),
            )

            await service.restore(queue, 'party-mix')
            expect(queue.node.play).toHaveBeenCalled()
        })

        it('returns 0 if session not found', async () => {
            redisClientMock.get.mockResolvedValueOnce(null)
            const result = await service.restore(queue, 'nonexistent')
            expect(result.restoredCount).toBe(0)
        })
    })

    describe('list', () => {
        it('returns sorted session summaries', async () => {
            const now = Date.now()
            redisClientMock.smembers.mockResolvedValueOnce([
                'session-1',
                'session-2',
            ])
            redisClientMock.get
                .mockResolvedValueOnce(
                    JSON.stringify({
                        name: 'session-1',
                        savedBy: 'user-1',
                        savedAt: now - 1000,
                        trackCount: 5,
                    }),
                )
                .mockResolvedValueOnce(
                    JSON.stringify({
                        name: 'session-2',
                        savedBy: 'user-2',
                        savedAt: now,
                        trackCount: 3,
                    }),
                )

            const list = await service.list('guild-1')
            expect(list).toHaveLength(2)
            expect(list[0].name).toBe('session-2')
        })

        it('returns empty array if no sessions', async () => {
            redisClientMock.smembers.mockResolvedValueOnce([])
            const list = await service.list('guild-1')
            expect(list).toEqual([])
        })
    })

    describe('delete', () => {
        it('removes session data and index entry', async () => {
            await service.delete('guild-1', 'party-mix')
            expect(redisClientMock.del).toHaveBeenCalledWith(
                'music:named-session:guild-1:party-mix',
            )
            expect(redisClientMock.srem).toHaveBeenCalledWith(
                'music:named-sessions:guild-1',
                'party-mix',
            )
        })

        it('returns false if session not found', async () => {
            redisClientMock.del.mockResolvedValueOnce(0)
            const result = await service.delete('guild-1', 'nonexistent')
            expect(result).toBe(false)
        })

        it('returns true if deletion successful', async () => {
            const result = await service.delete('guild-1', 'party-mix')
            expect(result).toBe(true)
        })
    })

    describe('get', () => {
        it('retrieves session by guildId and name', async () => {
            const sessionData = {
                name: 'party-mix',
                guildId: 'guild-1',
                savedBy: 'user-1',
                savedAt: Date.now(),
                trackCount: 5,
                currentTrack: null,
                upcomingTracks: [],
            }
            redisClientMock.get.mockResolvedValueOnce(
                JSON.stringify(sessionData),
            )

            const session = await service.get('guild-1', 'party-mix')
            expect(session).toEqual(sessionData)
        })

        it('returns null if session not found', async () => {
            redisClientMock.get.mockResolvedValueOnce(null)
            const session = await service.get('guild-1', 'nonexistent')
            expect(session).toBeNull()
        })
    })

    describe('name validation', () => {
        const validNames = ['party-mix', 'chill-vibes', 'rock-hits', 'a', '123']
        const invalidNames = [
            'party mix',
            'party_mix',
            'party@mix',
            '',
            'a'.repeat(33),
        ]

        validNames.forEach((name) => {
            it(`accepts valid name: ${name}`, async () => {
                redisClientMock.exists.mockResolvedValueOnce(0)
                const session = await service.save(queue, name, 'user-1')
                expect(session).not.toBeNull()
            })
        })

        invalidNames.forEach((name) => {
            it(`rejects invalid name: ${name}`, async () => {
                const session = await service.save(queue, name, 'user-1')
                expect(session).toBeNull()
            })
        })
    })
})
