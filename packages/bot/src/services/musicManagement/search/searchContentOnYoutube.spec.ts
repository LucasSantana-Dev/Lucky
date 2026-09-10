import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { CustomClient } from '../../../types'

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
}))

jest.mock('./index', () => ({
    enhancedYouTubeSearch: jest.fn(),
    enhancedAutoSearch: jest.fn(),
}))

jest.mock('../youtubeErrorHandler', () => ({
    logYouTubeError: jest.fn(),
    isRecoverableYouTubeError: jest.fn(),
}))

import { searchContentOnYoutube } from './searchContentOnYoutube'

function createClient(withPlayer = true): CustomClient {
    return { player: withPlayer ? {} : undefined } as CustomClient
}

function createInteraction(): ChatInputCommandInteraction {
    return {
        user: { id: 'userid' },
        guild: { id: 'guildid' },
    } as ChatInputCommandInteraction
}

function searchResult(trackCount: number) {
    return { tracks: new Array(trackCount).fill({}) }
}

describe('searchContentOnYoutube', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        const { isRecoverableYouTubeError } = require('../youtubeErrorHandler')
        isRecoverableYouTubeError.mockReturnValue(false)
    })

    it('returns the YouTube result without reaching the auto fallback', async () => {
        const { enhancedYouTubeSearch, enhancedAutoSearch } = require('./index')
        const result = searchResult(3)
        enhancedYouTubeSearch.mockResolvedValue({ success: true, result })

        await expect(
            searchContentOnYoutube({
                client: createClient(),
                searchTerms: 'a song',
                interaction: createInteraction(),
            }),
        ).resolves.toBe(result)

        expect(enhancedAutoSearch).not.toHaveBeenCalled()
    })

    it('forwards isPlaylist to the YouTube search', async () => {
        const { enhancedYouTubeSearch } = require('./index')
        enhancedYouTubeSearch.mockResolvedValue({
            success: true,
            result: searchResult(1),
        })

        await searchContentOnYoutube({
            client: createClient(),
            searchTerms: 'a playlist',
            interaction: createInteraction(),
            isPlaylist: true,
        })

        expect(enhancedYouTubeSearch).toHaveBeenCalledWith(
            expect.anything(),
            'a playlist',
            expect.objectContaining({ id: 'userid' }),
            true,
        )
    })

    it('defaults isPlaylist to false', async () => {
        const { enhancedYouTubeSearch } = require('./index')
        enhancedYouTubeSearch.mockResolvedValue({
            success: true,
            result: searchResult(1),
        })

        await searchContentOnYoutube({
            client: createClient(),
            searchTerms: 'a song',
            interaction: createInteraction(),
        })

        expect(enhancedYouTubeSearch).toHaveBeenCalledWith(
            expect.anything(),
            'a song',
            expect.anything(),
            false,
        )
    })

    // success:false and a success with no result are distinct shapes that must
    // both fall through, not just the obvious one.
    it.each([
        ['an unsuccessful search', { success: false }],
        ['a success carrying no result', { success: true, result: undefined }],
    ])('falls back to auto search after %s', async (_label, ytResponse) => {
        const { enhancedYouTubeSearch, enhancedAutoSearch } = require('./index')
        const auto = searchResult(2)
        enhancedYouTubeSearch.mockResolvedValue(ytResponse)
        enhancedAutoSearch.mockResolvedValue({ success: true, result: auto })

        await expect(
            searchContentOnYoutube({
                client: createClient(),
                searchTerms: 'a song',
                interaction: createInteraction(),
            }),
        ).resolves.toBe(auto)

        expect(enhancedAutoSearch).toHaveBeenCalled()
    })

    it('throws "No results found" when both searches come back empty', async () => {
        const { enhancedYouTubeSearch, enhancedAutoSearch } = require('./index')
        enhancedYouTubeSearch.mockResolvedValue({ success: false })
        enhancedAutoSearch.mockResolvedValue({ success: false })

        await expect(
            searchContentOnYoutube({
                client: createClient(),
                searchTerms: 'a song',
                interaction: createInteraction(),
            }),
        ).rejects.toThrow('No results found')
    })

    it('throws when the client has no player', async () => {
        await expect(
            searchContentOnYoutube({
                client: createClient(false),
                searchTerms: 'a song',
                interaction: createInteraction(),
            }),
        ).rejects.toThrow('Player not initialized')
    })

    it('routes a recoverable error to the YouTube error log and rethrows', async () => {
        const { enhancedYouTubeSearch } = require('./index')
        const {
            isRecoverableYouTubeError,
            logYouTubeError,
        } = require('../youtubeErrorHandler')
        const { errorLog } = require('@lucky/shared/utils')
        const boom = new Error('parser exploded')
        enhancedYouTubeSearch.mockRejectedValue(boom)
        isRecoverableYouTubeError.mockReturnValue(true)

        await expect(
            searchContentOnYoutube({
                client: createClient(),
                searchTerms: 'a song',
                interaction: createInteraction(),
            }),
        ).rejects.toThrow('parser exploded')

        expect(logYouTubeError).toHaveBeenCalledWith(
            boom,
            'searchContentOnYoutube',
            'unknown',
        )
        expect(errorLog).not.toHaveBeenCalled()
    })

    it('routes an unrecoverable error to the generic error log and rethrows', async () => {
        const { enhancedYouTubeSearch } = require('./index')
        const { logYouTubeError } = require('../youtubeErrorHandler')
        const { errorLog } = require('@lucky/shared/utils')
        enhancedYouTubeSearch.mockRejectedValue(new Error('network down'))

        await expect(
            searchContentOnYoutube({
                client: createClient(),
                searchTerms: 'a song',
                interaction: createInteraction(),
            }),
        ).rejects.toThrow('network down')

        expect(errorLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('network down'),
            }),
        )
        expect(logYouTubeError).not.toHaveBeenCalled()
    })

    it('tolerates an interaction with no guild', async () => {
        const { enhancedYouTubeSearch } = require('./index')
        enhancedYouTubeSearch.mockRejectedValue(new Error('network down'))
        const interaction = {
            user: { id: 'userid' },
            guild: null,
        } as unknown as ChatInputCommandInteraction

        await expect(
            searchContentOnYoutube({
                client: createClient(),
                searchTerms: 'a song',
                interaction,
            }),
        ).rejects.toThrow('network down')
    })
})
