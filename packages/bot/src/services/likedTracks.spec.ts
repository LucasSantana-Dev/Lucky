const prisma = {
    likedTrack: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
    },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
}
const errorLogMock = jest.fn()
const hostedYoutubeMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: () => prisma,
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('discord-player', () => ({ QueryType: { AUTO: 'auto' } }))

jest.mock('../config/featureFlags', () => ({
    isHostedYoutubeEnabled: () => hostedYoutubeMock(),
}))

jest.mock('../functions/music/commands/play/handlers/resolveProvider', () => ({
    textSearchBlockOptions: (query: string) =>
        query.startsWith('http') ? {} : { blockExtractors: ['blocked'] },
}))

jest.mock('./musicRecommendation/sessionSnapshots', () => ({
    toSnapshotTrack: (track: Record<string, string>) => ({
        title: track.title,
        author: track.author,
        url: track.url,
        duration: '3:00',
        source: 'spotify',
    }),
}))

import {
    LIKED_PLAY_BATCH,
    LIKED_TRACKS_MAX,
    findLikedTracks,
    likeTrack,
    listLikedTracks,
    queueLikedTracks,
    unlikeTrack,
} from './likedTracks'

const playing = {
    title: 'Creep',
    author: 'Radiohead',
    url: 'https://open.spotify.com/track/t1',
} as never

const liked = (id: string, url = `https://open.spotify.com/track/${id}`) => ({
    id,
    title: `Song ${id}`,
    author: 'Artist',
    url,
    duration: '3:00',
})

function queueWith(found: (query: string) => unknown) {
    const search = jest.fn(async (query: string) => {
        const track = found(query)
        return { tracks: track ? [track] : [] }
    })
    const queue = {
        player: { search },
        addTrack: jest.fn(),
        currentTrack: null as unknown,
        node: { play: jest.fn().mockResolvedValue(undefined) },
    }
    return { queue, search }
}

const user = { id: 'user-1' } as never

/** The client Prisma hands to a transaction callback. */
const tx = {
    likedTrack: {
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
    },
    $executeRaw: jest.fn(),
}

describe('liked tracks', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        hostedYoutubeMock.mockReturnValue(false)
        tx.likedTrack.findUnique.mockResolvedValue(null)
        tx.likedTrack.count.mockResolvedValue(0)
        tx.likedTrack.create.mockResolvedValue({ id: 'new-1' })
        tx.$executeRaw.mockResolvedValue(1)
        prisma.$transaction.mockImplementation(
            (run: (client: typeof tx) => unknown) => run(tx),
        )
        prisma.likedTrack.findMany.mockResolvedValue([])
    })

    describe('likeTrack', () => {
        it('saves the song under the member, keyed by title and artist', async () => {
            await expect(likeTrack('user-1', playing)).resolves.toBe('saved')

            const { data } = tx.likedTrack.create.mock.calls[0][0]
            expect(data).toEqual({
                discordUserId: 'user-1',
                trackKey: expect.any(String),
                title: 'Creep',
                author: 'Radiohead',
                url: 'https://open.spotify.com/track/t1',
                duration: '3:00',
                source: 'spotify',
            })
            expect(tx.likedTrack.findUnique).toHaveBeenCalledWith({
                where: {
                    discordUserId_trackKey: {
                        discordUserId: 'user-1',
                        trackKey: data.trackKey,
                    },
                },
                select: { id: true },
            })
        })

        it("takes the member's lock before it checks the limit", async () => {
            await likeTrack('user-1', playing)

            expect(tx.$executeRaw.mock.calls[0][1]).toBe('liked-tracks:user-1')
            expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
                tx.likedTrack.count.mock.invocationCallOrder[0],
            )
            expect(
                tx.likedTrack.count.mock.invocationCallOrder[0],
            ).toBeLessThan(tx.likedTrack.create.mock.invocationCallOrder[0])
        })

        it('reads and writes only through the transaction', async () => {
            await likeTrack('user-1', playing)

            expect(tx.likedTrack.create).toHaveBeenCalledTimes(1)
            expect(prisma.likedTrack.findUnique).not.toHaveBeenCalled()
            expect(prisma.likedTrack.count).not.toHaveBeenCalled()
            expect(prisma.likedTrack.create).not.toHaveBeenCalled()
            expect(prisma.$executeRaw).not.toHaveBeenCalled()
        })

        it('stores the title without the Markdown escapes it arrives with', async () => {
            await likeTrack('user-1', {
                title: 'Song \\*2\\* \\\\',
                author: 'Band',
                url: 'https://open.spotify.com/track/t2',
            } as never)

            expect(tx.likedTrack.create.mock.calls[0][0].data.title).toBe(
                'Song *2* \\',
            )
        })

        it('says so when the song is already liked', async () => {
            tx.likedTrack.findUnique.mockResolvedValue({ id: 'l1' })

            await expect(likeTrack('user-1', playing)).resolves.toBe('already')
            expect(tx.likedTrack.create).not.toHaveBeenCalled()
        })

        it('refuses a new song when the list is full', async () => {
            tx.likedTrack.count.mockResolvedValue(LIKED_TRACKS_MAX)

            await expect(likeTrack('user-1', playing)).resolves.toBe('full')
            expect(tx.likedTrack.create).not.toHaveBeenCalled()
        })

        it('reports a failed write without throwing', async () => {
            tx.likedTrack.create.mockRejectedValue(new Error('db down'))

            await expect(likeTrack('user-1', playing)).resolves.toBe('failed')
            expect(errorLogMock).toHaveBeenCalled()
        })
    })

    describe('listLikedTracks', () => {
        it('returns the newest songs and the total', async () => {
            prisma.likedTrack.findMany.mockResolvedValue([liked('a')])
            prisma.likedTrack.count.mockResolvedValue(40)

            await expect(listLikedTracks('user-1', 15)).resolves.toEqual({
                tracks: [liked('a')],
                total: 40,
            })
            expect(prisma.likedTrack.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { discordUserId: 'user-1' },
                    orderBy: { likedAt: 'desc' },
                    take: 15,
                }),
            )
        })

        it('answers null when the read fails, not an empty list', async () => {
            prisma.likedTrack.findMany.mockRejectedValue(new Error('db down'))

            await expect(listLikedTracks('user-1', 15)).resolves.toBeNull()
        })
    })

    describe('findLikedTracks', () => {
        it('matches the typed text against title and artist', async () => {
            await findLikedTracks('user-1', ' creep ', 25)

            const { where } = prisma.likedTrack.findMany.mock.calls[0][0]
            expect(where.discordUserId).toBe('user-1')
            expect(where.OR).toEqual([
                { title: { contains: 'creep', mode: 'insensitive' } },
                { author: { contains: 'creep', mode: 'insensitive' } },
            ])
        })

        it('lists the newest songs when nothing is typed', async () => {
            await findLikedTracks('user-1', '  ', 25)

            expect(prisma.likedTrack.findMany.mock.calls[0][0].where).toEqual({
                discordUserId: 'user-1',
            })
        })
    })

    describe('unlikeTrack', () => {
        it("removes the member's own song and returns it", async () => {
            prisma.likedTrack.findFirst.mockResolvedValue(liked('a'))

            await expect(unlikeTrack('user-1', 'a')).resolves.toEqual(
                liked('a'),
            )
            expect(prisma.likedTrack.deleteMany).toHaveBeenCalledWith({
                where: { id: 'a', discordUserId: 'user-1' },
            })
        })

        it("leaves another member's song alone", async () => {
            prisma.likedTrack.findFirst.mockResolvedValue(null)

            await expect(unlikeTrack('user-1', 'a')).resolves.toBeNull()
            expect(prisma.likedTrack.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'a', discordUserId: 'user-1' },
                }),
            )
            expect(prisma.likedTrack.deleteMany).not.toHaveBeenCalled()
        })
    })

    describe('queueLikedTracks', () => {
        it('adds the found songs, counts the missed ones and starts playback', async () => {
            const { queue, search } = queueWith((query) =>
                query.endsWith('/a') ? { title: 'found a' } : null,
            )

            await expect(
                queueLikedTracks(queue as never, user, [
                    liked('a'),
                    liked('b'),
                ]),
            ).resolves.toEqual({ added: 1, missed: 1 })

            expect(search).toHaveBeenCalledWith(
                'https://open.spotify.com/track/a',
                { requestedBy: user, searchEngine: 'auto' },
            )
            expect(queue.addTrack).toHaveBeenCalledWith({ title: 'found a' })
            expect(queue.node.play).toHaveBeenCalledTimes(1)
        })

        it('leaves a song that is on, playing or paused, as it is', async () => {
            const { queue } = queueWith(() => ({ title: 'found' }))
            queue.currentTrack = { title: 'on now' }

            await queueLikedTracks(queue as never, user, [liked('a')])

            expect(queue.addTrack).toHaveBeenCalledTimes(1)
            expect(queue.node.play).not.toHaveBeenCalled()
        })

        it('looks a YouTube link up by title and artist while YouTube is off', async () => {
            const { queue, search } = queueWith(() => ({ title: 'found' }))

            await queueLikedTracks(queue as never, user, [
                liked('a', 'https://www.youtube.com/watch?v=abc'),
            ])

            expect(search).toHaveBeenCalledWith('Song a Artist', {
                requestedBy: user,
                searchEngine: 'auto',
                blockExtractors: ['blocked'],
            })
        })

        it('adds at most one batch from a longer list', async () => {
            const many = Array.from({ length: LIKED_PLAY_BATCH + 10 }, (_, i) =>
                liked(`t${i}`),
            )
            const { queue } = queueWith(() => ({ title: 'found' }))

            await expect(
                queueLikedTracks(queue as never, user, many),
            ).resolves.toEqual({ added: LIKED_PLAY_BATCH, missed: 0 })
        })

        it('counts a failed lookup as missed and keeps going', async () => {
            const { queue, search } = queueWith(() => ({ title: 'found' }))
            search.mockRejectedValueOnce(new Error('extractor down'))

            await expect(
                queueLikedTracks(queue as never, user, [
                    liked('a'),
                    liked('b'),
                ]),
            ).resolves.toEqual({ added: 1, missed: 1 })
        })

        it('does not start playback when nothing was found', async () => {
            const { queue } = queueWith(() => null)

            await expect(
                queueLikedTracks(queue as never, user, [liked('a')]),
            ).resolves.toEqual({ added: 0, missed: 1 })
            expect(queue.node.play).not.toHaveBeenCalled()
        })
    })
})
