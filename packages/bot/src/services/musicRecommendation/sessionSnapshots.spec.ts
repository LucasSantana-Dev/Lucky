import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { GuildQueue } from 'discord-player'
import { getPrismaClient } from '@lucky/shared/utils'
import { MusicSessionSnapshotService } from './sessionSnapshots'

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: jest.fn(),
    getDbNull: jest.fn(() => 'DB_NULL'),
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('@lucky/shared/config', () => ({
    ENVIRONMENT_CONFIG: {
        SESSIONS: { QUEUE_SESSION_TTL: 7200 },
    },
}))

jest.mock('discord-player', () => ({
    QueryType: { AUTO: 'auto' },
}))

const mockGetPrismaClient = jest.mocked(getPrismaClient)
const mockFindUnique = jest.fn<any>()
const mockFindMany = jest.fn<any>()
const mockDeleteMany = jest.fn<any>()
const mockCreate = jest.fn<any>()
const mockUpsert = jest.fn<any>()

/** Builds a `music_session_snapshots` row for mock returns. */
function snapshotRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'row-1',
        guildId: 'guild-1',
        sessionSnapshotId: 'snap-1',
        savedAt: new Date(),
        currentTrack: null,
        upcomingTracks: [
            {
                title: 'Recovered Song',
                author: 'Recovered Artist',
                url: 'https://example.com/recovered',
                duration: '3:00',
                source: 'youtube',
            },
        ],
        voiceChannelId: null,
        ...overrides,
    }
}

function restoringQueue(guildId: string, searchResult?: unknown) {
    const addTrack = jest.fn()
    return {
        guild: { id: guildId },
        currentTrack: null,
        tracks: { size: 0 },
        addTrack,
        clear: jest.fn(),
        node: {
            isPlaying: () => false,
            play: jest.fn(async () => undefined),
            remove: jest.fn(),
        },
        player: {
            search: jest.fn(
                async () =>
                    searchResult ?? {
                        tracks: [
                            {
                                title: 'Recovered Song',
                                author: 'Recovered Artist',
                                url: 'https://example.com/recovered',
                                metadata: null,
                                setMetadata: jest.fn(function (
                                    this: { metadata: unknown },
                                    m: unknown,
                                ) {
                                    this.metadata = m
                                }),
                            },
                        ],
                    },
            ),
        },
    } as unknown as GuildQueue
}

describe('MusicSessionSnapshotService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockGetPrismaClient.mockReturnValue({
            musicSessionSnapshot: {
                findUnique: mockFindUnique,
                findMany: mockFindMany,
                deleteMany: mockDeleteMany,
                create: mockCreate,
                upsert: mockUpsert,
            },
        } as any)
        mockFindUnique.mockResolvedValue(null)
        mockFindMany.mockResolvedValue([])
        mockDeleteMany.mockResolvedValue({ count: 1 })
        mockCreate.mockResolvedValue(snapshotRow())
        mockUpsert.mockResolvedValue(snapshotRow())
    })

    describe('saveSnapshot', () => {
        it('overwrites the guild snapshot with one atomic upsert and returns it', async () => {
            const service = new MusicSessionSnapshotService()
            const queue = {
                guild: { id: 'guild-1' },
                currentTrack: {
                    title: 'Now Song',
                    author: 'Now Artist',
                    url: 'https://example.com/now',
                    duration: '3:10',
                    source: 'youtube',
                },
                tracks: {
                    toArray: () => [
                        {
                            title: 'Next Song',
                            author: 'Next Artist',
                            url: 'https://example.com/next',
                            duration: '2:40',
                            source: 'youtube',
                        },
                    ],
                },
                channel: { id: 'channel-1' },
            } as unknown as GuildQueue

            const result = await service.saveSnapshot(queue)

            expect(result).not.toBeNull()
            expect(mockDeleteMany).not.toHaveBeenCalled()
            expect(mockCreate).not.toHaveBeenCalled()
            expect(mockUpsert).toHaveBeenCalledWith({
                where: { guildId: 'guild-1' },
                create: expect.objectContaining({
                    guildId: 'guild-1',
                    voiceChannelId: 'channel-1',
                    sessionSnapshotId: expect.any(String),
                    upcomingTracks: expect.any(Array),
                    currentTrack: expect.objectContaining({
                        title: 'Now Song',
                    }),
                }),
                update: expect.objectContaining({
                    voiceChannelId: 'channel-1',
                    savedAt: expect.any(Date),
                    currentTrack: expect.objectContaining({
                        title: 'Now Song',
                    }),
                }),
            })
        })

        it('writes DbNull when currentTrack is cleared, and restore reads it as no current track', async () => {
            const service = new MusicSessionSnapshotService()
            const queue = {
                guild: { id: 'guild-1' },
                currentTrack: null,
                tracks: {
                    toArray: () => [
                        {
                            title: 'Next Song',
                            author: 'Next Artist',
                            url: 'https://example.com/next',
                            duration: '2:40',
                            source: 'youtube',
                        },
                    ],
                },
                channel: { id: 'channel-1' },
            } as unknown as GuildQueue

            const saved = await service.saveSnapshot(queue)

            expect(saved?.currentTrack).toBeNull()
            const args = mockUpsert.mock.calls[0][0]
            expect(args.update.currentTrack).toBe('DB_NULL')
            expect(args.create.currentTrack).toBe('DB_NULL')

            // A stored SQL NULL comes back from Prisma as null.
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({ currentTrack: null }),
            )
            const read = await service.getSnapshot('guild-1')
            expect(read?.currentTrack).toBeNull()
        })

        it('resolves concurrent saves for one guild without throwing; the later write wins', async () => {
            const stored = new Map<string, any>()
            mockUpsert.mockImplementation(async (args: any) => {
                // yield so both saves are in flight before either lands
                await new Promise((r) => setImmediate(r))
                stored.set(args.where.guildId, args.update)
                return snapshotRow()
            })
            const makeQueue = (title: string) =>
                ({
                    guild: { id: 'guild-1' },
                    currentTrack: {
                        title,
                        author: 'a',
                        url: `https://example.com/${title}`,
                        duration: '1:00',
                        source: 'youtube',
                    },
                    tracks: { toArray: () => [] },
                    channel: { id: 'channel-1' },
                }) as unknown as GuildQueue
            const service = new MusicSessionSnapshotService()

            const first = service.saveSnapshot(makeQueue('first'))
            const second = service.saveSnapshot(makeQueue('second'))
            const [a, b] = await Promise.all([first, second])

            expect(a).not.toBeNull()
            expect(b).not.toBeNull()
            expect(mockUpsert).toHaveBeenCalledTimes(2)
            expect(stored.get('guild-1').currentTrack.title).toBe('second')
            expect(stored.get('guild-1').sessionSnapshotId).toBe(
                b?.sessionSnapshotId,
            )
        })

        it('returns null when queue is empty and does not write', async () => {
            const service = new MusicSessionSnapshotService()
            const queue = {
                guild: { id: 'guild-empty' },
                currentTrack: null,
                tracks: { toArray: () => [] },
            } as unknown as GuildQueue

            const result = await service.saveSnapshot(queue)

            expect(result).toBeNull()
            expect(mockUpsert).not.toHaveBeenCalled()
        })

        it('returns null on upsert error', async () => {
            mockUpsert.mockRejectedValueOnce(new Error('db down'))
            const service = new MusicSessionSnapshotService()
            const queue = {
                guild: { id: 'guild-err' },
                currentTrack: {
                    title: 't',
                    author: 'a',
                    url: 'u',
                    duration: '1',
                    source: 'youtube',
                },
                tracks: { toArray: () => [] },
            } as unknown as GuildQueue

            expect(await service.saveSnapshot(queue)).toBeNull()
        })

        it('surfaces the Prisma error code + meta when the upsert fails', async () => {
            mockUpsert.mockRejectedValueOnce({
                name: 'PrismaClientKnownRequestError',
                code: 'P2003',
                meta: { field_name: 'guildId' },
                message:
                    'Invalid `prisma.musicSessionSnapshot.upsert()` invocation:',
            })
            const service = new MusicSessionSnapshotService()
            const queue = {
                guild: { id: 'guild-err' },
                currentTrack: {
                    title: 't',
                    author: 'a',
                    url: 'u',
                    duration: '1',
                    source: 'youtube',
                },
                tracks: { toArray: () => [] },
            } as unknown as GuildQueue

            expect(await service.saveSnapshot(queue)).toBeNull()

            const { errorLog } = require('@lucky/shared/utils')
            expect(errorLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Failed to save music session snapshot',
                    data: {
                        prismaCode: 'P2003',
                        prismaMeta: { field_name: 'guildId' },
                    },
                }),
            )
        })
    })

    describe('getSnapshot', () => {
        it('maps a fresh row to a snapshot', async () => {
            mockFindUnique.mockResolvedValueOnce(snapshotRow())
            const service = new MusicSessionSnapshotService()
            const snap = await service.getSnapshot('guild-1')
            expect(snap).toMatchObject({
                sessionSnapshotId: 'snap-1',
                guildId: 'guild-1',
                currentTrack: null,
            })
            expect(snap?.upcomingTracks).toHaveLength(1)
        })

        it('returns null and prunes a row older than the storage TTL', async () => {
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({ savedAt: new Date(Date.now() - 60 * 60 * 1000) }),
            )
            const service = new MusicSessionSnapshotService(1) // 1s TTL
            const snap = await service.getSnapshot('guild-1')
            expect(snap).toBeNull()
            expect(mockDeleteMany).toHaveBeenCalledWith({
                where: { guildId: 'guild-1' },
            })
        })

        it('returns null on read error', async () => {
            mockFindUnique.mockRejectedValueOnce(new Error('db down'))
            const service = new MusicSessionSnapshotService()
            expect(await service.getSnapshot('g')).toBeNull()
        })

        it('returns null when no row exists', async () => {
            mockFindUnique.mockResolvedValueOnce(null)
            const service = new MusicSessionSnapshotService()
            expect(await service.getSnapshot('g')).toBeNull()
        })
    })

    describe('listGuildIds', () => {
        it('returns guild ids for non-expired snapshots (TTL-filtered query)', async () => {
            mockFindMany.mockResolvedValueOnce([
                { guildId: 'g1' },
                { guildId: 'g2' },
            ])
            const service = new MusicSessionSnapshotService()
            expect(await service.listGuildIds()).toEqual(['g1', 'g2'])
            expect(mockFindMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { savedAt: { gte: expect.any(Date) } },
                    select: { guildId: true },
                }),
            )
        })

        it('returns an empty array on query error', async () => {
            mockFindMany.mockRejectedValueOnce(new Error('db down'))
            const service = new MusicSessionSnapshotService()
            expect(await service.listGuildIds()).toEqual([])
        })
    })

    describe('restoreSnapshot', () => {
        it('restores upcoming tracks and clears the snapshot afterward', async () => {
            mockFindUnique.mockResolvedValueOnce(snapshotRow())
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-2')

            const result = await service.restoreSnapshot(queue)

            expect(result.restoredCount).toBe(1)
            expect(queue.addTrack).toHaveBeenCalledTimes(1)
            expect(mockDeleteMany).toHaveBeenCalledWith({
                where: { guildId: 'guild-2' },
            })
        })

        it('keeps a text-only entry away from SpotifyExtractor but lets a Spotify URL through', async () => {
            const spotifyUrl = 'https://open.spotify.com/track/abc123'
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({
                    upcomingTracks: [
                        {
                            title: 'Text Song',
                            author: 'Text Artist',
                            url: '',
                            duration: '3:00',
                            source: 'spotify',
                        },
                        {
                            title: 'Link Song',
                            author: 'Link Artist',
                            url: spotifyUrl,
                            duration: '3:00',
                            source: 'spotify',
                        },
                    ],
                }),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-text')

            await service.restoreSnapshot(queue)

            // SpotifyExtractor claims any text on AUTO, so a Spotify outage
            // would drop the entry; a Spotify link must still reach it.
            expect(queue.player.search).toHaveBeenCalledWith(
                'Text Song Text Artist',
                expect.objectContaining({
                    blockExtractors: expect.arrayContaining([
                        'com.discord-player.itsmaat.spotifyextractor',
                    ]),
                }),
            )
            expect(queue.player.search).toHaveBeenCalledWith(
                spotifyUrl,
                expect.not.objectContaining({
                    blockExtractors: expect.anything(),
                }),
            )
        })

        describe('HOSTED_YOUTUBE_ENABLED = false (#2486)', () => {
            const originalEnv = process.env.HOSTED_YOUTUBE_ENABLED

            beforeEach(() => {
                process.env.HOSTED_YOUTUBE_ENABLED = 'false'
            })

            afterEach(() => {
                if (originalEnv === undefined) {
                    delete process.env.HOSTED_YOUTUBE_ENABLED
                } else {
                    process.env.HOSTED_YOUTUBE_ENABLED = originalEnv
                }
            })

            it('skips a youtube.com entry without searching and counts it', async () => {
                mockFindUnique.mockResolvedValueOnce(
                    snapshotRow({
                        currentTrack: null,
                        upcomingTracks: [
                            {
                                title: 'YT Song',
                                author: 'Artist',
                                url: 'https://www.youtube.com/watch?v=abc123',
                                duration: '3:00',
                                source: 'youtube',
                            },
                            {
                                title: 'Recovered Song',
                                author: 'Recovered Artist',
                                url: 'https://example.com/recovered',
                                duration: '3:00',
                                source: 'soundcloud',
                            },
                        ],
                    }),
                )
                const service = new MusicSessionSnapshotService()
                const queue = restoringQueue('guild-yt-skip')

                const result = await service.restoreSnapshot(queue)

                expect(result.restoredCount).toBe(1)
                expect(result.skippedYoutubeCount).toBe(1)
                // Must be the non-YouTube entry that was actually searched,
                // not just any single call (cubic review on #2486).
                expect(queue.player.search).toHaveBeenCalledTimes(1)
                expect(queue.player.search).toHaveBeenCalledWith(
                    'https://example.com/recovered',
                    expect.anything(),
                )
            })

            it('reports 0 restored with a skipped count when every entry is youtube-only', async () => {
                mockFindUnique.mockResolvedValueOnce(
                    snapshotRow({
                        currentTrack: null,
                        upcomingTracks: [
                            {
                                title: 'YT Song',
                                author: 'Artist',
                                url: 'https://youtu.be/abc123',
                                duration: '3:00',
                                source: 'youtube',
                            },
                        ],
                    }),
                )
                const service = new MusicSessionSnapshotService()
                const queue = restoringQueue('guild-yt-all-skip')

                const result = await service.restoreSnapshot(queue)

                expect(result.restoredCount).toBe(0)
                expect(result.skippedYoutubeCount).toBe(1)
                expect(queue.player.search).not.toHaveBeenCalled()
                expect(queue.node.play).not.toHaveBeenCalled()
            })
        })

        it('bails before enqueuing anything when already aborted (no clear, no remove)', async () => {
            mockFindUnique.mockResolvedValueOnce(snapshotRow())
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-abort')
            const controller = new AbortController()
            controller.abort() // already aborted: loop must bail before enqueuing

            const result = await service.restoreSnapshot(queue, undefined, {
                signal: controller.signal,
            })

            expect(result.restoredCount).toBe(0)
            expect(queue.addTrack).not.toHaveBeenCalled()
            // Nothing was added, so nothing is removed; the whole queue is never cleared.
            expect(queue.node.remove).not.toHaveBeenCalled()
            expect(queue.clear).not.toHaveBeenCalled()
        })

        it('restores a snapshot once when two restores for one guild overlap', async () => {
            // Prod 2026-11-13: the startup sweep's queue.connect() fired the
            // connection handler's own restore. Both passed the empty-queue
            // guard before either added a track, so every song was queued
            // twice (A A B B) and play() ran twice.
            mockFindUnique.mockResolvedValue(snapshotRow())
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-overlap')
            const tracks = { size: 0 }
            ;(queue as unknown as { tracks: typeof tracks }).tracks = tracks
            ;(queue.addTrack as jest.Mock).mockImplementation(() => {
                tracks.size += 1
            })

            const [first, second] = await Promise.all([
                service.restoreSnapshot(queue),
                service.restoreSnapshot(queue),
            ])

            expect(queue.addTrack).toHaveBeenCalledTimes(1)
            expect(queue.node.play).toHaveBeenCalledTimes(1)
            expect(first.restoredCount + second.restoredCount).toBe(1)
        })

        it('makes a second restore wait, then run when the first restored nothing', async () => {
            // Hold the first restore's snapshot read open: the second must not
            // read until the first settles. The first finds no snapshot (as an
            // aborted, undone restore would leave things), so the second runs.
            let releaseFirst: (row: unknown) => void = () => undefined
            mockFindUnique
                .mockImplementationOnce(
                    () =>
                        new Promise((resolve) => {
                            releaseFirst = resolve
                        }),
                )
                .mockResolvedValue(snapshotRow())
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-waits')

            const first = service.restoreSnapshot(queue)
            const second = service.restoreSnapshot(queue)
            await new Promise((resolve) => setImmediate(resolve))

            expect(mockFindUnique).toHaveBeenCalledTimes(1)

            releaseFirst(null)
            expect((await first).restoredCount).toBe(0)
            expect((await second).restoredCount).toBe(1)
            expect(mockFindUnique).toHaveBeenCalledTimes(2)
        })

        it('lets the waiter restore after the first restore aborts and rolls back', async () => {
            // First restore adds T1, is held on T2's search, gets aborted and
            // undoes T1. The waiter, started while T1 was queued, must re-run
            // the empty-queue guard and restore, not skip the session.
            mockFindUnique.mockResolvedValue(
                snapshotRow({
                    upcomingTracks: [
                        {
                            title: 'T1',
                            author: 'A',
                            url: 'u1',
                            duration: '1',
                            source: 'x',
                        },
                        {
                            title: 'T2',
                            author: 'A',
                            url: 'u2',
                            duration: '1',
                            source: 'x',
                        },
                    ],
                }),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-rollback')
            const queued = new Set<unknown>()
            const tracks = {
                get size() {
                    return queued.size
                },
            }
            ;(queue as unknown as { tracks: typeof tracks }).tracks = tracks
            ;(queue.addTrack as jest.Mock).mockImplementation((t) => {
                queued.add(t)
            })
            ;(queue.node.remove as jest.Mock).mockImplementation((t) => {
                queued.delete(t)
            })
            let releaseT2: () => void = () => undefined
            let searchCalls = 0
            ;(queue.player.search as jest.Mock).mockImplementation(async () => {
                searchCalls += 1
                if (searchCalls === 2) {
                    await new Promise<void>((resolve) => {
                        releaseT2 = resolve
                    })
                }
                return {
                    tracks: [
                        { title: `t${searchCalls}`, setMetadata: jest.fn() },
                    ],
                }
            })
            const controller = new AbortController()

            const first = service.restoreSnapshot(queue, undefined, {
                signal: controller.signal,
            })
            while (searchCalls < 2) {
                await new Promise((resolve) => setImmediate(resolve))
            }
            expect(queued.size).toBe(1)
            const waiter = service.restoreSnapshot(queue)
            controller.abort()
            releaseT2()

            expect((await first).restoredCount).toBe(0)
            expect((await waiter).restoredCount).toBe(2)
            expect(queued.size).toBe(2)
            expect(queue.node.play).toHaveBeenCalledTimes(1)
        })

        it('stops waiting on a stuck restore after the wait limit', async () => {
            jest.useFakeTimers()
            try {
                mockFindUnique
                    .mockImplementationOnce(() => new Promise(() => undefined))
                    .mockResolvedValue(snapshotRow())
                const service = new MusicSessionSnapshotService()
                const queue = restoringQueue('guild-stuck')

                void service.restoreSnapshot(queue)
                const second = service.restoreSnapshot(queue)
                await jest.advanceTimersByTimeAsync(30_000)

                expect((await second).restoredCount).toBe(1)
            } finally {
                jest.useRealTimers()
            }
        })

        it('gives up waiting without reading when its own signal aborts', async () => {
            mockFindUnique.mockImplementationOnce(
                () => new Promise(() => undefined),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-abort-wait')
            const controller = new AbortController()

            void service.restoreSnapshot(queue)
            const waiting = service.restoreSnapshot(queue, undefined, {
                signal: controller.signal,
            })
            controller.abort()

            expect((await waiting).restoredCount).toBe(0)
            expect(mockFindUnique).toHaveBeenCalledTimes(1)
        })

        it('undoes only its own restored tracks when aborted mid-restore', async () => {
            // Two-track snapshot; abort fires during the 2nd search (after track 1 added).
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({
                    upcomingTracks: [
                        {
                            title: 'T1',
                            author: 'A1',
                            url: 'u1',
                            duration: '1',
                            source: 'youtube',
                        },
                        {
                            title: 'T2',
                            author: 'A2',
                            url: 'u2',
                            duration: '1',
                            source: 'youtube',
                        },
                    ],
                }),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-mid-abort')
            const controller = new AbortController()
            let searchCalls = 0
            ;(queue.player.search as jest.Mock).mockImplementation(async () => {
                searchCalls += 1
                if (searchCalls === 2) controller.abort()
                return {
                    tracks: [
                        {
                            title: 'x',
                            author: 'y',
                            url: 'z',
                            setMetadata: jest.fn(),
                        },
                    ],
                }
            })

            const result = await service.restoreSnapshot(queue, undefined, {
                signal: controller.signal,
            })

            // Track 1 was added then undone via node.remove; nothing committed.
            expect(result.restoredCount).toBe(0)
            expect(queue.addTrack).toHaveBeenCalledTimes(1)
            expect(queue.node.remove).toHaveBeenCalledTimes(1)
            expect(queue.clear).not.toHaveBeenCalled()
        })

        it('deletes the snapshot only after play() commits, not before (#2335)', async () => {
            // Regression for #2335: deleteSnapshot() must not run until the
            // restore can no longer be cancelled, i.e. after play() has been
            // invoked. Deleting first and checking the signal afterward meant
            // a stop landing during deleteSnapshot()'s own async work could
            // destroy the only persisted copy of a session that never
            // actually resumed — undoRestoredTracks() cannot undo a database
            // row that is already gone.
            mockFindUnique.mockResolvedValueOnce(snapshotRow())
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-play-before-delete')

            const result = await service.restoreSnapshot(queue)

            expect(result.restoredCount).toBe(1)
            const playOrder = (queue.node.play as jest.Mock).mock
                .invocationCallOrder[0]
            const deleteOrder = mockDeleteMany.mock.invocationCallOrder[0]
            expect(playOrder).toBeLessThan(deleteOrder)
        })

        it('does not delete the snapshot when play() commits after an abort mid-restore (#2335)', async () => {
            // If the abort lands before the commit point (still covered by the
            // loop's own checks for a multi-track restore), the snapshot must
            // survive so a later attempt can retry it.
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({
                    upcomingTracks: [
                        {
                            title: 'T1',
                            author: 'A1',
                            url: 'u1',
                            duration: '1',
                            source: 'youtube',
                        },
                        {
                            title: 'T2',
                            author: 'A2',
                            url: 'u2',
                            duration: '1',
                            source: 'youtube',
                        },
                    ],
                }),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-no-delete-on-abort')
            const controller = new AbortController()
            let searchCalls = 0
            ;(queue.player.search as jest.Mock).mockImplementation(async () => {
                searchCalls += 1
                if (searchCalls === 2) controller.abort()
                return {
                    tracks: [
                        {
                            title: 'x',
                            author: 'y',
                            url: 'z',
                            setMetadata: jest.fn(),
                        },
                    ],
                }
            })

            const result = await service.restoreSnapshot(queue, undefined, {
                signal: controller.signal,
            })

            expect(result.restoredCount).toBe(0)
            expect(queue.node.play).not.toHaveBeenCalled()
            expect(mockDeleteMany).not.toHaveBeenCalled()
        })

        it('prepends the current track to the restore list', async () => {
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({
                    currentTrack: {
                        title: 'Was Playing',
                        author: 'Artist A',
                        url: 'https://example.com/current',
                        duration: '3:00',
                        source: 'youtube',
                    },
                }),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-ct', {
                tracks: [
                    {
                        title: 'resolved',
                        author: 'resolved',
                        url: 'x',
                        metadata: null,
                        setMetadata: jest.fn(),
                    },
                ],
            })

            const result = await service.restoreSnapshot(queue)
            expect(result.restoredCount).toBe(2)
            expect(queue.addTrack).toHaveBeenCalledTimes(2)
        })

        it('rejects a snapshot older than maxAgeMs WITHOUT deleting it', async () => {
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({ savedAt: new Date(Date.now() - 60 * 60 * 1000) }),
            )
            const service = new MusicSessionSnapshotService(7200) // within storage TTL
            const queue = restoringQueue('guild-stale')

            const result = await service.restoreSnapshot(queue, undefined, {
                maxAgeMs: 30 * 60 * 1000,
            })

            expect(result.restoredCount).toBe(0)
            expect(result.sessionSnapshotId).toBeNull()
            expect(queue.addTrack).not.toHaveBeenCalled()
            expect(mockDeleteMany).not.toHaveBeenCalled()
        })

        it('preserves autoplay metadata on restored tracks', async () => {
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({
                    upcomingTracks: [],
                    currentTrack: {
                        title: 'Recommended Song',
                        author: 'Recommended Artist',
                        url: 'https://example.com/recommended',
                        duration: '3:00',
                        source: 'youtube',
                        recommendationReason: 'Because you listened',
                        isAutoplay: true,
                        requestedById: 'user-1',
                    },
                }),
            )
            const restoredTrack = {
                title: 'Recommended Song',
                author: 'Recommended Artist',
                url: 'https://example.com/recommended',
                metadata: null as unknown,
                setMetadata(m: unknown) {
                    this.metadata = m
                },
            }
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-autoplay', {
                tracks: [restoredTrack],
            })

            await service.restoreSnapshot(queue)

            expect(queue.addTrack).toHaveBeenCalledWith(
                expect.objectContaining({
                    metadata: expect.objectContaining({
                        isAutoplay: true,
                        requestedById: 'user-1',
                        recommendationReason: 'Because you listened',
                    }),
                }),
            )
        })

        it('drops queued autoplay picks so a restart does not replay stale recommendations', async () => {
            // Prod 2026-11-16: after a deploy the restore replayed picks the
            // old autoplay had queued, unrelated to what the user asked for.
            // The current track still resumes and autoplay refills the rest.
            const entry = (title: string, isAutoplay?: boolean) => ({
                title,
                author: 'A',
                url: `https://example.com/${title}`,
                duration: '3:00',
                source: 'spotify',
                ...(isAutoplay ? { isAutoplay } : {}),
            })
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({
                    currentTrack: entry('playing', true),
                    upcomingTracks: [
                        entry('stale-pick', true),
                        entry('user-request'),
                        entry('stale-pick-2', true),
                    ],
                }),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-stale-autoplay', {
                tracks: [
                    {
                        title: 'resolved',
                        author: 'resolved',
                        url: 'x',
                        metadata: null,
                        setMetadata: jest.fn(),
                    },
                ],
            })

            const result = await service.restoreSnapshot(queue)

            const searched = (queue.player.search as jest.Mock).mock.calls.map(
                (c) => c[0],
            )
            expect(searched).toEqual([
                'https://example.com/playing',
                'https://example.com/user-request',
            ])
            expect(result.restoredCount).toBe(2)
        })

        it('keeps queued autoplay picks for an in-process recovery', async () => {
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({
                    upcomingTracks: [
                        {
                            title: 'pick',
                            author: 'A',
                            url: 'https://example.com/pick',
                            duration: '3:00',
                            source: 'spotify',
                            isAutoplay: true,
                        },
                    ],
                }),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-keep-autoplay')

            const result = await service.restoreSnapshot(queue, undefined, {
                skipCurrentTrack: true,
                keepAutoplay: true,
            })

            expect(result.restoredCount).toBe(1)
        })

        it('returns early when the queue already has tracks (no read)', async () => {
            const service = new MusicSessionSnapshotService()
            const queue = {
                guild: { id: 'guild-busy' },
                currentTrack: { title: 'Playing Now' },
                tracks: { size: 2 },
            } as unknown as GuildQueue

            const result = await service.restoreSnapshot(queue)
            expect(result.restoredCount).toBe(0)
            expect(mockFindUnique).not.toHaveBeenCalled()
        })

        it('does not clear the snapshot when nothing is restored', async () => {
            mockFindUnique.mockResolvedValueOnce(snapshotRow())
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-noresult', { tracks: [] })

            const result = await service.restoreSnapshot(queue)
            expect(result.restoredCount).toBe(0)
            expect(mockDeleteMany).not.toHaveBeenCalled()
        })

        it('skips the current track when skipCurrentTrack is true', async () => {
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({
                    currentTrack: {
                        title: 'Same Song',
                        author: 'Artist',
                        url: 'https://example.com/same',
                        duration: '3:00',
                        source: 'youtube',
                    },
                }),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-skip')

            await service.restoreSnapshot(queue, undefined, {
                skipCurrentTrack: true,
            })
            expect(queue.addTrack).toHaveBeenCalledTimes(1)
        })

        it('rolls back the queue when search throws mid-restore', async () => {
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({
                    currentTrack: {
                        title: 'Current Song',
                        author: 'Artist 1',
                        url: 'https://example.com/cur',
                        duration: '3:45',
                        source: 'youtube',
                    },
                }),
            )
            const clear = jest.fn()
            const search = jest
                .fn<any>()
                .mockResolvedValueOnce({ tracks: [{ title: 'Current Song' }] })
                .mockRejectedValueOnce(new Error('search unavailable'))
            const queue = {
                guild: { id: 'g' },
                currentTrack: null,
                tracks: { size: 0 },
                player: { search },
                clear,
                addTrack: jest.fn(),
            } as unknown as GuildQueue

            const service = new MusicSessionSnapshotService()
            const result = await service.restoreSnapshot(queue)

            expect(clear).toHaveBeenCalledTimes(1)
            expect(result.restoredCount).toBe(0)
            expect(result.sessionSnapshotId).toBeNull()
        })
    })

    describe('deleteSnapshot / clearSnapshotIfStale', () => {
        it('swallows delete errors', async () => {
            mockDeleteMany.mockRejectedValueOnce(new Error('db down'))
            const service = new MusicSessionSnapshotService()
            await expect(service.deleteSnapshot('g')).resolves.toBeUndefined()
        })

        it('clearSnapshotIfStale is a no-op when the queue has upcoming tracks', async () => {
            const service = new MusicSessionSnapshotService()
            const queue = {
                guild: { id: 'g' },
                currentTrack: { title: 't' },
                tracks: { size: 3 },
            } as unknown as GuildQueue
            await service.clearSnapshotIfStale(queue)
            expect(mockFindUnique).not.toHaveBeenCalled()
        })

        it('clearSnapshotIfStale skips when the snapshot has upcoming tracks', async () => {
            mockFindUnique.mockResolvedValueOnce(snapshotRow())
            const service = new MusicSessionSnapshotService()
            const queue = {
                guild: { id: 'guild-1' },
                currentTrack: { title: 't' },
                tracks: { size: 0 },
            } as unknown as GuildQueue
            await service.clearSnapshotIfStale(queue)
            expect(mockDeleteMany).not.toHaveBeenCalled()
        })
    })

    // #3151: a restart replayed the current track from 0:00.
    describe('resume position (#3151)', () => {
        const MINUTE = 60_000

        function currentTrackRow(
            current: Record<string, unknown>,
            savedAgoMs = 0,
        ) {
            return snapshotRow({
                savedAt: new Date(Date.now() - savedAgoMs),
                currentTrack: {
                    title: 'Was Playing',
                    author: 'Artist A',
                    url: 'https://example.com/current',
                    duration: '5:00',
                    source: 'spotify',
                    ...current,
                },
            })
        }

        it('saves the playback position, duration and paused state of the current track', async () => {
            const service = new MusicSessionSnapshotService()
            const queue = {
                guild: { id: 'guild-1' },
                currentTrack: {
                    title: 'Now Song',
                    author: 'Now Artist',
                    url: 'https://example.com/now',
                    duration: '5:00',
                    durationMS: 300_000,
                },
                tracks: { toArray: () => [] },
                channel: { id: 'channel-1' },
                node: { playbackTime: 95_400, isPaused: () => true },
            } as unknown as GuildQueue

            const result = await service.saveSnapshot(queue)

            expect(result?.currentTrack).toMatchObject({
                positionMs: 95_400,
                durationMs: 300_000,
                paused: true,
            })
            const written = (
                mockUpsert.mock.calls[0][0] as {
                    update: { currentTrack: Record<string, unknown> }
                }
            ).update.currentTrack
            expect(written).toMatchObject({
                positionMs: 95_400,
                durationMs: 300_000,
                paused: true,
            })
        })

        it('does not put a position on upcoming tracks', async () => {
            const service = new MusicSessionSnapshotService()
            const queue = {
                guild: { id: 'guild-1' },
                currentTrack: null,
                tracks: {
                    toArray: () => [
                        {
                            title: 'Next',
                            author: 'A',
                            url: 'https://example.com/next',
                            duration: '2:00',
                            durationMS: 120_000,
                        },
                    ],
                },
                channel: { id: 'channel-1' },
                node: { playbackTime: 50_000, isPaused: () => false },
            } as unknown as GuildQueue

            const result = await service.saveSnapshot(queue)

            expect(result?.upcomingTracks[0].positionMs).toBeUndefined()
        })

        it('resumes the current track at its saved position', async () => {
            mockFindUnique.mockResolvedValueOnce(
                currentTrackRow({ positionMs: 95_000, durationMs: 300_000 }),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-1')

            const result = await service.restoreSnapshot(queue)

            expect(result.restoredCount).toBe(2)
            expect(queue.node.play).toHaveBeenCalledWith(undefined, {
                seek: 95_000,
            })
        })

        it('starts from the top when the saved position is only a few seconds in', async () => {
            mockFindUnique.mockResolvedValueOnce(
                currentTrackRow({ positionMs: 1_500, durationMs: 300_000 }),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-1')

            await service.restoreSnapshot(queue)

            expect(queue.node.play).toHaveBeenCalledWith()
        })

        it('skips the current track when little of it is left', async () => {
            mockFindUnique.mockResolvedValueOnce(
                currentTrackRow({ positionMs: 290_000, durationMs: 300_000 }),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-1')

            const result = await service.restoreSnapshot(queue)

            // Only the upcoming track comes back, and it starts from the top.
            expect(result.restoredCount).toBe(1)
            expect(queue.player.search).toHaveBeenCalledTimes(1)
            expect(queue.player.search).toHaveBeenCalledWith(
                'https://example.com/recovered',
                expect.anything(),
            )
            expect(queue.node.play).toHaveBeenCalledWith()
        })

        it('does not replay a current track that should already have ended (the "Forever" case)', async () => {
            // Legacy snapshot without a position, saved 16 min ago, track 5:57:
            // even played from 0:00 it would have ended 10 min ago.
            mockFindUnique.mockResolvedValueOnce(
                currentTrackRow(
                    { title: 'Forever', duration: '5:57' },
                    16 * MINUTE,
                ),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-1')

            const result = await service.restoreSnapshot(queue)

            expect(result.restoredCount).toBe(1)
            expect(queue.player.search).toHaveBeenCalledTimes(1)
            expect(queue.player.search).not.toHaveBeenCalledWith(
                'https://example.com/current',
                expect.anything(),
            )
        })

        it('does not replay a playing track whose remaining time ran out while the bot was down', async () => {
            mockFindUnique.mockResolvedValueOnce(
                currentTrackRow(
                    { positionMs: 240_000, durationMs: 300_000 },
                    2 * MINUTE,
                ),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-1')

            const result = await service.restoreSnapshot(queue)

            expect(result.restoredCount).toBe(1)
            expect(queue.node.play).toHaveBeenCalledWith()
        })

        it('resumes a paused track at its position however long ago it was saved', async () => {
            mockFindUnique.mockResolvedValueOnce(
                currentTrackRow(
                    { positionMs: 240_000, durationMs: 300_000, paused: true },
                    10 * MINUTE,
                ),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-1')
            const pause = jest.fn()
            ;(queue.node as unknown as { pause: jest.Mock }).pause = pause

            const result = await service.restoreSnapshot(queue)

            expect(result.restoredCount).toBe(2)
            expect(queue.node.play).toHaveBeenCalledWith(undefined, {
                seek: 240_000,
            })
            // It was paused before the restart, so it comes back paused.
            expect(pause).toHaveBeenCalledTimes(1)
        })

        it('does not pause a restored track that was playing', async () => {
            mockFindUnique.mockResolvedValueOnce(
                currentTrackRow({ positionMs: 95_000, durationMs: 300_000 }),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-1')
            const pause = jest.fn()
            ;(queue.node as unknown as { pause: jest.Mock }).pause = pause

            const result = await service.restoreSnapshot(queue)

            // The current track really was restored and resumed, then left playing.
            expect(result.restoredCount).toBe(2)
            expect(queue.node.play).toHaveBeenCalledWith(undefined, {
                seek: 95_000,
            })
            expect(pause).not.toHaveBeenCalled()
        })

        it('consumes a snapshot whose only track was dropped, so it is not retried', async () => {
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-1')
            // Current-only snapshot, nearly over: nothing will be restored.
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({
                    upcomingTracks: [],
                    currentTrack: {
                        title: 'Almost Over',
                        author: 'A',
                        url: 'https://example.com/current',
                        duration: '5:00',
                        source: 'spotify',
                        positionMs: 290_000,
                        durationMs: 300_000,
                    },
                }),
            )

            const result = await service.restoreSnapshot(queue)

            expect(result.restoredCount).toBe(0)
            expect(queue.player.search).not.toHaveBeenCalled()
            expect(mockDeleteMany).toHaveBeenCalledWith({
                where: { guildId: 'guild-1' },
            })
        })

        it('keeps the snapshot when the current track is skipped on purpose (orphan recovery)', async () => {
            mockFindUnique.mockResolvedValueOnce(
                snapshotRow({
                    upcomingTracks: [],
                    currentTrack: {
                        title: 'Now',
                        author: 'A',
                        url: 'https://example.com/current',
                        duration: '5:00',
                        source: 'spotify',
                    },
                }),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-1')

            await service.restoreSnapshot(queue, undefined, {
                skipCurrentTrack: true,
            })

            expect(mockDeleteMany).not.toHaveBeenCalled()
        })

        it('does not seek into an upcoming track when the current one failed to resolve', async () => {
            mockFindUnique.mockResolvedValueOnce(
                currentTrackRow({ positionMs: 95_000, durationMs: 300_000 }),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-1')
            const search = queue.player.search as unknown as jest.Mock<any>
            search.mockResolvedValueOnce({ tracks: [] })

            const result = await service.restoreSnapshot(queue)

            expect(result.restoredCount).toBe(1)
            expect(queue.node.play).toHaveBeenCalledWith()
        })

        it('restores a current track with an unknown duration from its position', async () => {
            mockFindUnique.mockResolvedValueOnce(
                currentTrackRow(
                    { positionMs: 95_000, duration: 'live' },
                    5 * MINUTE,
                ),
            )
            const service = new MusicSessionSnapshotService()
            const queue = restoringQueue('guild-1')

            const result = await service.restoreSnapshot(queue)

            expect(result.restoredCount).toBe(2)
            expect(queue.node.play).toHaveBeenCalledWith(undefined, {
                seek: 95_000,
            })
        })
    })

    describe('autosave (#3151)', () => {
        function liveQueue(id: string, playing: boolean, paused = false) {
            return {
                guild: { id },
                currentTrack: {
                    title: 'Now',
                    author: 'A',
                    url: `https://example.com/${id}`,
                    duration: '3:00',
                    durationMS: 180_000,
                },
                tracks: { toArray: () => [] },
                channel: { id: 'c' },
                node: {
                    playbackTime: 10_000,
                    isPaused: () => paused,
                    isPlaying: () => playing,
                },
            } as unknown as GuildQueue
        }

        it('saves every playing queue on each tick and stops when asked', async () => {
            jest.useFakeTimers()
            try {
                const service = new MusicSessionSnapshotService()
                const queues = [liveQueue('g1', true), liveQueue('g2', false)]
                service.startAutosave(() => queues, 30_000)

                await jest.advanceTimersByTimeAsync(30_000)
                expect(mockUpsert).toHaveBeenCalledTimes(1)
                expect(mockUpsert).toHaveBeenCalledWith(
                    expect.objectContaining({ where: { guildId: 'g1' } }),
                )

                await jest.advanceTimersByTimeAsync(30_000)
                expect(mockUpsert).toHaveBeenCalledTimes(2)

                service.stopAutosave()
                await jest.advanceTimersByTimeAsync(90_000)
                expect(mockUpsert).toHaveBeenCalledTimes(2)
            } finally {
                jest.useRealTimers()
            }
        })

        it('starting twice keeps a single timer', async () => {
            jest.useFakeTimers()
            try {
                const service = new MusicSessionSnapshotService()
                const queues = [liveQueue('g1', true)]
                service.startAutosave(() => queues, 30_000)
                service.startAutosave(() => queues, 30_000)

                await jest.advanceTimersByTimeAsync(30_000)
                expect(mockUpsert).toHaveBeenCalledTimes(1)
                service.stopAutosave()
            } finally {
                jest.useRealTimers()
            }
        })

        it('also saves a paused queue, so a pause then a crash keeps the right position', async () => {
            jest.useFakeTimers()
            try {
                const service = new MusicSessionSnapshotService()
                const queues = [
                    liveQueue('paused', false, true),
                    liveQueue('idle', false, false),
                ]
                service.startAutosave(() => queues, 30_000)

                await jest.advanceTimersByTimeAsync(30_000)
                expect(mockUpsert).toHaveBeenCalledTimes(1)
                expect(mockUpsert).toHaveBeenCalledWith(
                    expect.objectContaining({ where: { guildId: 'paused' } }),
                )
                service.stopAutosave()
            } finally {
                jest.useRealTimers()
            }
        })

        it('skips a tick while the previous save is still pending', async () => {
            jest.useFakeTimers()
            try {
                let release: () => void = () => {}
                mockUpsert.mockImplementationOnce(
                    () =>
                        new Promise((resolve) => {
                            release = () => resolve(snapshotRow())
                        }),
                )
                const service = new MusicSessionSnapshotService()
                const queues = [liveQueue('g1', true)]
                service.startAutosave(() => queues, 30_000)

                await jest.advanceTimersByTimeAsync(30_000)
                await jest.advanceTimersByTimeAsync(30_000)
                // Second tick found the first save in flight and skipped.
                expect(mockUpsert).toHaveBeenCalledTimes(1)

                release()
                await jest.advanceTimersByTimeAsync(30_000)
                expect(mockUpsert).toHaveBeenCalledTimes(2)
                service.stopAutosave()
            } finally {
                jest.useRealTimers()
            }
        })

        it('keeps ticking when listing queues throws', async () => {
            jest.useFakeTimers()
            try {
                const service = new MusicSessionSnapshotService()
                let calls = 0
                service.startAutosave(() => {
                    calls += 1
                    if (calls === 1) throw new Error('boom')
                    return [liveQueue('g1', true)]
                }, 30_000)

                await jest.advanceTimersByTimeAsync(60_000)
                expect(mockUpsert).toHaveBeenCalledTimes(1)
                service.stopAutosave()
            } finally {
                jest.useRealTimers()
            }
        })
    })
})
