import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { Player } from 'discord-player'
import type { User } from 'discord.js'

const performSearch = jest.fn()
const performRetrySearch = jest.fn()

jest.mock('./engineManager', () => ({
    SearchEngineManager: jest.fn(function () {
        this.performSearch = performSearch
        this.performRetrySearch = performRetrySearch
    }),
}))

import {
    EnhancedSearchService,
    enhancedSearch,
    enhancedAutoSearch,
    enhancedYouTubeSearch,
    enhancedSpotifySearch,
} from './index'

const RESULT = { success: true, attempts: 1 }

function createPlayer(): Player {
    return {} as Player
}

function createUser(): User {
    return { id: 'userid' } as User
}

/** The engine the wrapper asked for, from the single recorded call. */
function requestedEngine(): unknown {
    const [options] = performSearch.mock.calls[0] as [
        { preferredEngine?: unknown },
    ]
    return options.preferredEngine
}

describe('search barrel', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        performSearch.mockResolvedValue(RESULT)
        performRetrySearch.mockResolvedValue(RESULT)
    })

    describe('EnhancedSearchService', () => {
        it('delegates search to the engine manager', async () => {
            const service = new EnhancedSearchService(createPlayer())
            const options = { query: 'q', requestedBy: createUser() }

            await expect(service.search(options)).resolves.toBe(RESULT)
            expect(performSearch).toHaveBeenCalledWith(options)
        })

        it('delegates searchWithRetry to the retry path, not the plain one', async () => {
            const service = new EnhancedSearchService(createPlayer())
            const options = { query: 'q', requestedBy: createUser() }

            await expect(service.searchWithRetry(options)).resolves.toBe(RESULT)
            expect(performRetrySearch).toHaveBeenCalledWith(options)
            expect(performSearch).not.toHaveBeenCalled()
        })
    })

    describe('engine selection', () => {
        // The only thing these four wrappers do differently is the engine they
        // pin, so that is what each assertion pins down.
        it('enhancedSearch forwards the caller-supplied engine', async () => {
            await enhancedSearch(
                createPlayer(),
                'q',
                createUser(),
                'soundcloud',
            )

            expect(requestedEngine()).toBe('soundcloud')
        })

        it('enhancedSearch leaves the engine unset when none is given', async () => {
            await enhancedSearch(createPlayer(), 'q', createUser())

            expect(requestedEngine()).toBeUndefined()
        })

        it('enhancedAutoSearch leaves the engine unset for auto-detection', async () => {
            await enhancedAutoSearch(createPlayer(), 'q', createUser())

            expect(requestedEngine()).toBeUndefined()
        })

        it('enhancedYouTubeSearch picks the track engine by default', async () => {
            await enhancedYouTubeSearch(createPlayer(), 'q', createUser())

            expect(requestedEngine()).toBe('youtube')
        })

        it('enhancedYouTubeSearch picks the playlist engine when asked', async () => {
            await enhancedYouTubeSearch(createPlayer(), 'q', createUser(), true)

            expect(requestedEngine()).toBe('youtubePlaylist')
        })

        it('enhancedSpotifySearch pins spotify', async () => {
            await enhancedSpotifySearch(createPlayer(), 'q', createUser())

            expect(requestedEngine()).toBe('spotify')
        })
    })

    it('passes the query and requester through unchanged', async () => {
        const requestedBy = createUser()

        await enhancedSearch(createPlayer(), 'a query', requestedBy)

        expect(performSearch).toHaveBeenCalledWith(
            expect.objectContaining({ query: 'a query', requestedBy }),
        )
    })
})
