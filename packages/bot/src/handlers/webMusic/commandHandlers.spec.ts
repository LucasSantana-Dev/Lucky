import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
    handlePause,
    handleStop,
    handleSkip,
    handlePrevious,
    handlePlay,
} from './commandHandlers'

const publishStateMock = jest.fn()
const buildQueueStateMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const setReplenishSuppressedMock = jest.fn()
const isHostedYoutubeEnabledMock = jest.fn(() => true)
const FAKE_BLOCKED_EXTRACTORS = ['blocked-spotify', 'blocked-attachment']

jest.mock('discord-player', () => ({
    QueryType: {
        YOUTUBE_SEARCH: 'youtubeSearch',
        SOUNDCLOUD_SEARCH: 'soundcloudSearch',
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    warnLog: jest.fn(),
}))

jest.mock(
    '../../functions/music/commands/play/handlers/resolveProvider',
    () => ({
        TEXT_SEARCH_BLOCKED_EXTRACTORS: [
            'blocked-spotify',
            'blocked-attachment',
        ],
    }),
)

jest.mock('../../functions/music/commands/play/queryUtils', () => ({
    isUrl: (query: string) => /^https?:\/\//i.test(query),
}))

jest.mock('../../config/featureFlags', () => ({
    isHostedYoutubeEnabled: () => isHostedYoutubeEnabledMock(),
}))

jest.mock('@lucky/shared/services', () => ({
    musicControlService: {
        publishState: (...args: unknown[]) => publishStateMock(...args),
    },
}))

jest.mock('./mappers', () => ({
    buildQueueState: (...args: unknown[]) => buildQueueStateMock(...args),
    repeatModeToEnum: jest.fn(() => 0),
}))

jest.mock('../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('../../services/musicManagement/replenishSuppressionStore', () => ({
    setReplenishSuppressed: (...args: unknown[]) =>
        setReplenishSuppressedMock(...args),
}))

describe('handleStop', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        buildQueueStateMock.mockResolvedValue({ guildId: 'guild-1' })
    })

    it('stops node, clears, and deletes the queue', async () => {
        const stop = jest.fn()
        const clear = jest.fn()
        const del = jest.fn()
        resolveGuildQueueMock.mockReturnValue({
            queue: { node: { stop }, clear, delete: del },
        })

        const result = await handleStop(
            {} as any,
            { id: 'cmd-1', guildId: 'guild-1', data: {} } as any,
        )

        expect(stop).toHaveBeenCalled()
        expect(clear).toHaveBeenCalled()
        expect(del).toHaveBeenCalled()
        expect(result.success).toBe(true)
    })

    it('suppresses autoplay replenish for 30 seconds', async () => {
        const stop = jest.fn()
        const clear = jest.fn()
        const del = jest.fn()
        resolveGuildQueueMock.mockReturnValue({
            queue: { node: { stop }, clear, delete: del },
        })

        await handleStop(
            {} as any,
            { id: 'cmd-1', guildId: 'guild-1', data: {} } as any,
        )

        expect(setReplenishSuppressedMock).toHaveBeenCalledWith(
            'guild-1',
            30_000,
        )
    })

    it('returns failure when no queue', async () => {
        resolveGuildQueueMock.mockReturnValue({ queue: null })

        const result = await handleStop(
            {} as any,
            { id: 'cmd-2', guildId: 'guild-1', data: {} } as any,
        )

        expect(result.success).toBe(false)
        expect(result.error).toBe('No active queue')
    })
})

describe('handleSkip', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        buildQueueStateMock.mockResolvedValue({ guildId: 'guild-1' })
    })

    it('awaits queue.node.skip() before publishing state', async () => {
        const skipAsync = jest.fn().mockResolvedValue(undefined)
        resolveGuildQueueMock.mockReturnValue({
            queue: { node: { skip: skipAsync } },
        })

        const publishPromise = Promise.resolve()
        publishStateMock.mockReturnValue(publishPromise)

        const result = await handleSkip(
            {} as any,
            { id: 'cmd-1', guildId: 'guild-1', data: {} } as any,
        )

        expect(skipAsync).toHaveBeenCalled()
        expect(publishStateMock).toHaveBeenCalled()
        expect(result.success).toBe(true)
    })

    it('returns failure when no queue', async () => {
        resolveGuildQueueMock.mockReturnValue({ queue: null })

        const result = await handleSkip(
            {} as any,
            { id: 'cmd-2', guildId: 'guild-1', data: {} } as any,
        )

        expect(result.success).toBe(false)
        expect(result.error).toBe('No active queue')
    })
})

describe('webMusic commandHandlers queue resolution', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        buildQueueStateMock.mockResolvedValue({ guildId: 'guild-1' })
    })

    it('uses resolver-backed queue for pause command', async () => {
        const pause = jest.fn()
        resolveGuildQueueMock.mockReturnValue({
            queue: {
                node: { pause },
            },
            source: 'cache.guild',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 1,
                cacheSampleKeys: [],
            },
        })

        const result = await handlePause(
            {} as any,
            { id: 'cmd-1', guildId: 'guild-1', data: {} } as any,
        )

        expect(resolveGuildQueueMock).toHaveBeenCalledWith(
            expect.anything(),
            'guild-1',
        )
        expect(pause).toHaveBeenCalled()
        expect(publishStateMock).toHaveBeenCalledWith({ guildId: 'guild-1' })
        expect(result.success).toBe(true)
    })

    it('returns failure when resolver misses queue', async () => {
        resolveGuildQueueMock.mockReturnValue({
            queue: null,
            source: 'miss',
            diagnostics: {
                guildId: 'guild-1',
                cacheSize: 0,
                cacheSampleKeys: [],
            },
        })

        const result = await handlePause(
            {} as any,
            { id: 'cmd-2', guildId: 'guild-1', data: {} } as any,
        )

        expect(result.success).toBe(false)
        expect(result.error).toBe('No active queue')
        expect(publishStateMock).not.toHaveBeenCalled()
    })
})

describe('handlePrevious', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        buildQueueStateMock.mockResolvedValue({ guildId: 'guild-1' })
    })

    it('calls queue.history.previous() when history is not empty', async () => {
        const previousAsync = jest.fn().mockResolvedValue(undefined)
        resolveGuildQueueMock.mockReturnValue({
            queue: {
                currentTrack: { title: 'Track' },
                history: {
                    isEmpty: jest.fn().mockReturnValue(false),
                    previous: previousAsync,
                },
            },
        })

        const publishPromise = Promise.resolve()
        publishStateMock.mockReturnValue(publishPromise)

        const result = await handlePrevious(
            {} as any,
            { id: 'cmd-1', guildId: 'guild-1', data: {} } as any,
        )

        expect(previousAsync).toHaveBeenCalledWith(true)
        expect(publishStateMock).toHaveBeenCalled()
        expect(result.success).toBe(true)
    })

    it('calls queue.node.seek(0) when history is empty', async () => {
        const seekAsync = jest.fn().mockResolvedValue(undefined)
        resolveGuildQueueMock.mockReturnValue({
            queue: {
                currentTrack: { title: 'Track' },
                history: {
                    isEmpty: jest.fn().mockReturnValue(true),
                    previous: jest.fn(),
                },
                node: { seek: seekAsync },
            },
        })

        const publishPromise = Promise.resolve()
        publishStateMock.mockReturnValue(publishPromise)

        const result = await handlePrevious(
            {} as any,
            { id: 'cmd-3', guildId: 'guild-1', data: {} } as any,
        )

        expect(seekAsync).toHaveBeenCalledWith(0)
        expect(publishStateMock).toHaveBeenCalled()
        expect(result.success).toBe(true)
    })

    it('does not seek when history is empty and no current track', async () => {
        const seekAsync = jest.fn().mockResolvedValue(undefined)
        resolveGuildQueueMock.mockReturnValue({
            queue: {
                currentTrack: null,
                history: {
                    isEmpty: jest.fn().mockReturnValue(true),
                    previous: jest.fn(),
                },
                node: { seek: seekAsync },
            },
        })

        const publishPromise = Promise.resolve()
        publishStateMock.mockReturnValue(publishPromise)

        const result = await handlePrevious(
            {} as any,
            { id: 'cmd-4', guildId: 'guild-1', data: {} } as any,
        )

        expect(seekAsync).not.toHaveBeenCalled()
        expect(publishStateMock).toHaveBeenCalled()
        expect(result.success).toBe(true)
    })

    it('returns failure when no queue', async () => {
        resolveGuildQueueMock.mockReturnValue({ queue: null })

        const result = await handlePrevious(
            {} as any,
            { id: 'cmd-2', guildId: 'guild-1', data: {} } as any,
        )

        expect(result.success).toBe(false)
        expect(result.error).toBe('No active queue')
    })
})

describe('handlePlay', () => {
    const track = { title: 'Song' }
    const empty = { tracks: [], playlist: null }
    const found = { tracks: [track], playlist: null }

    function setup(searchResults: unknown[]) {
        const search = jest.fn<(...args: unknown[]) => Promise<unknown>>()
        for (const r of searchResults) search.mockResolvedValueOnce(r)
        const addTrack = jest.fn()
        resolveGuildQueueMock.mockReturnValue({
            queue: {
                addTrack,
                node: {
                    isPlaying: () => true,
                    isPaused: () => false,
                    play: jest.fn(),
                },
            },
        })
        const client = {
            guilds: {
                cache: {
                    get: () => ({ channels: { cache: { get: () => ({}) } } }),
                },
            },
            player: { search },
        }
        return { client, search, addTrack }
    }

    const cmd = (query: string) =>
        ({ id: 'cmd-p', guildId: 'guild-1', data: { query } }) as any

    beforeEach(() => {
        jest.clearAllMocks()
        buildQueueStateMock.mockResolvedValue({ guildId: 'guild-1' })
        isHostedYoutubeEnabledMock.mockReturnValue(true)
    })

    it('keeps the AUTO search result when Spotify answers', async () => {
        const { client, search, addTrack } = setup([found])

        const result = await handlePlay(client as any, cmd('daft punk'))

        expect(result.success).toBe(true)
        expect(search).toHaveBeenCalledTimes(1)
        expect(search).toHaveBeenCalledWith('daft punk', {
            requestedBy: undefined,
        })
        expect(addTrack).toHaveBeenCalledWith(track)
    })

    it('falls back to SoundCloud with the block list when text search is empty', async () => {
        isHostedYoutubeEnabledMock.mockReturnValue(false)
        const { client, search, addTrack } = setup([empty, found])

        const result = await handlePlay(client as any, cmd('daft punk'))

        expect(result.success).toBe(true)
        expect(search).toHaveBeenCalledTimes(2)
        expect(search).toHaveBeenLastCalledWith('daft punk', {
            requestedBy: undefined,
            searchEngine: 'soundcloudSearch',
            blockExtractors: FAKE_BLOCKED_EXTRACTORS,
        })
        expect(addTrack).toHaveBeenCalledWith(track)
    })

    it('tries YouTube before SoundCloud when hosted YouTube is enabled', async () => {
        const { client, search } = setup([empty, empty, found])

        const result = await handlePlay(client as any, cmd('daft punk'))

        expect(result.success).toBe(true)
        expect(
            search.mock.calls.map((c) => (c[1] as any).searchEngine),
        ).toEqual([undefined, 'youtubeSearch', 'soundcloudSearch'])
    })

    it('still tries SoundCloud when the YouTube fallback throws', async () => {
        const { client, search } = setup([empty])
        search.mockRejectedValueOnce(new Error('yt down'))
        search.mockResolvedValueOnce(found)

        const result = await handlePlay(client as any, cmd('daft punk'))

        expect(result.success).toBe(true)
        expect(search).toHaveBeenCalledTimes(3)
    })

    it('does not retry or block extractors for a URL query', async () => {
        const url = 'https://open.spotify.com/track/abc'
        const { client, search } = setup([empty])

        const result = await handlePlay(client as any, cmd(url))

        expect(result.success).toBe(false)
        expect(result.error).toBe('No results found')
        expect(search).toHaveBeenCalledTimes(1)
        expect(search).toHaveBeenCalledWith(url, { requestedBy: undefined })
    })

    it('reports no results when every fallback is empty', async () => {
        const { client } = setup([empty, empty, empty])

        const result = await handlePlay(client as any, cmd('nothing here'))

        expect(result.success).toBe(false)
        expect(result.error).toBe('No results found')
    })
})
