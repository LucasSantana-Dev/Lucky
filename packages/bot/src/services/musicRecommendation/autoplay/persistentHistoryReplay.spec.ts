import type { GuildQueue, Track } from 'discord-player'
import type { TrackHistoryEntry } from '@lucky/shared/services'
import {
    dedupeReplayPool,
    resolvePersistentHistoryReplay,
} from './persistentHistoryReplay'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
    infoLog: jest.fn(),
}))

function entry(overrides: Partial<TrackHistoryEntry> = {}): TrackHistoryEntry {
    return {
        trackId: 'id',
        title: 'Song',
        author: 'Artist',
        duration: '3:00',
        url: 'https://open.spotify.com/track/song',
        timestamp: 0,
        guildId: 'guildid',
        ...overrides,
    }
}

function trackFor(url: string, title = url): Track {
    return { url, title, author: 'Artist' } as Track
}

function queueWith(search: jest.Mock, queued: Track[] = []): GuildQueue {
    return {
        guild: { id: 'guildid' },
        player: { search },
        tracks: { toArray: () => queued },
        history: { tracks: { toArray: () => [] } },
    } as unknown as GuildQueue
}

const current = trackFor('https://x/playing', 'Playing')

describe('dedupeReplayPool', () => {
    it('drops excluded urls and keys and repeated songs', () => {
        const pool = dedupeReplayPool(
            [
                { url: 'https://x/a', title: 'A', author: 'One' },
                { url: 'https://x/a', title: 'A again', author: 'One' },
                { url: 'https://y/a', title: 'A', author: 'One' },
                { url: 'https://x/playing', title: 'P', author: 'One' },
                { url: 'https://x/b', title: 'Queued', author: 'Two' },
                { url: '', title: 'No url', author: 'Two' },
                { url: 'https://x/c', title: 'C', author: 'Three' },
            ],
            new Set(['https://x/playing']),
            new Set(['queued::two']),
        )
        expect(pool.map((t) => t.url)).toEqual(['https://x/a', 'https://x/c'])
    })
})

describe('resolvePersistentHistoryReplay', () => {
    it('resolves non-skipped persisted entries through player search', async () => {
        const search = jest.fn(async (query: string) => ({
            tracks: [trackFor(query)],
        }))

        const tracks = await resolvePersistentHistoryReplay(
            queueWith(search),
            current,
            [
                entry({ url: 'https://x/skipped', title: 'S', skipped: true }),
                entry({ url: 'https://x/kept', title: 'K' }),
            ],
            2,
            null,
        )

        expect(tracks.map((t) => t.url)).toEqual(['https://x/kept'])
        expect(search).toHaveBeenCalledTimes(1)
        expect(search.mock.calls[0][0]).toBe('https://x/kept')
    })

    it('skips entries that are playing or queued, before and after search', async () => {
        const search = jest.fn(async (_query: string) => ({
            tracks: [trackFor('https://x/playing', 'Playing')],
        }))
        // Same song as the queued track under another url: excluded by its
        // song identity, not by url.
        const queued = {
            url: 'https://y/queued',
            title: 'Queued Song',
            author: 'Other',
        } as Track

        const tracks = await resolvePersistentHistoryReplay(
            queueWith(search, [queued]),
            current,
            [
                entry({ url: 'https://x/playing', title: 'Playing' }),
                entry({
                    url: 'https://x/queued-old',
                    title: 'Queued Song',
                    author: 'Other',
                }),
                entry({ url: 'https://x/other', title: 'O' }),
            ],
            2,
            null,
        )

        expect(search).toHaveBeenCalledTimes(1)
        expect(search.mock.calls[0][0]).toBe('https://x/other')
        // The search resolved to what is already playing: not replayed.
        expect(tracks).toEqual([])
    })

    it('returns at most the limit and tolerates failed searches', async () => {
        const search = jest.fn(async (query: string) => {
            if (query.endsWith('/bad')) throw new Error('boom')
            return { tracks: [trackFor(query)] }
        })
        const history = ['bad', 'alpha', 'bravo', 'charlie'].map((s) =>
            entry({ url: `https://x/${s}`, title: s }),
        )

        const tracks = await resolvePersistentHistoryReplay(
            queueWith(search),
            current,
            history,
            2,
            null,
        )

        expect(tracks).toHaveLength(2)
        expect(tracks.map((t) => t.url)).not.toContain('https://x/bad')
    })

    it('returns nothing when the searches outlast the timeout', async () => {
        jest.useFakeTimers()
        try {
            const search = jest.fn(() => new Promise<never>(() => {}))
            const pending = resolvePersistentHistoryReplay(
                queueWith(search),
                current,
                [entry()],
                2,
                null,
                1_000,
            )
            await jest.advanceTimersByTimeAsync(1_000)
            expect(search).toHaveBeenCalledTimes(1)
            await expect(pending).resolves.toEqual([])
        } finally {
            jest.useRealTimers()
        }
    })

    it('does not search when there is no persisted history', async () => {
        const search = jest.fn()
        const tracks = await resolvePersistentHistoryReplay(
            queueWith(search),
            current,
            [],
            2,
            null,
        )
        expect(tracks).toEqual([])
        expect(search).not.toHaveBeenCalled()
    })
})
