import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import {
    createArtistTagFetcher,
    hasGenreTag,
    type ArtistTagFetcher,
} from './artistTagCache'

jest.mock('../../../lastfm', () => ({
    getArtistTopTags: jest.fn(),
}))

const { getArtistTopTags } = require('../../../lastfm')

describe('createArtistTagFetcher', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('returns empty array for undefined artist', async () => {
        const fetcher = createArtistTagFetcher()
        const result = await fetcher(undefined)
        expect(result).toEqual([])
    })

    it('returns empty array for empty string artist', async () => {
        const fetcher = createArtistTagFetcher()
        const result = await fetcher('')
        expect(result).toEqual([])
    })

    it('returns empty array for whitespace-only artist', async () => {
        const fetcher = createArtistTagFetcher()
        const result = await fetcher('   ')
        expect(result).toEqual([])
    })

    it('fetches tags from Last.fm for valid artist', async () => {
        const tags = ['rock', 'alternative', 'indie']
        getArtistTopTags.mockResolvedValue(tags)

        const fetcher = createArtistTagFetcher()
        const result = await fetcher('The Beatles')

        expect(getArtistTopTags).toHaveBeenCalledWith('The Beatles')
        expect(result).toEqual(tags)
    })

    it('caches results for same artist (case-insensitive)', async () => {
        const tags = ['pop', 'electronic']
        getArtistTopTags.mockResolvedValue(tags)

        const fetcher = createArtistTagFetcher()

        const result1 = await fetcher('Daft Punk')
        const result2 = await fetcher('daft punk')
        const result3 = await fetcher('DAFT PUNK')

        expect(getArtistTopTags).toHaveBeenCalledTimes(1)
        expect(result1).toEqual(tags)
        expect(result2).toEqual(tags)
        expect(result3).toEqual(tags)
    })

    it('coalesces concurrent requests for same artist', async () => {
        const tags = ['country', 'folk']
        getArtistTopTags.mockImplementation(
            () =>
                new Promise((resolve) => {
                    setTimeout(() => resolve(tags), 50)
                }),
        )

        const fetcher = createArtistTagFetcher()

        const [result1, result2, result3] = await Promise.all([
            fetcher('Willie Nelson'),
            fetcher('Willie Nelson'),
            fetcher('Willie Nelson'),
        ])

        expect(getArtistTopTags).toHaveBeenCalledTimes(1)
        expect(result1).toEqual(tags)
        expect(result2).toEqual(tags)
        expect(result3).toEqual(tags)
    })

    it('returns empty array when Last.fm fails', async () => {
        getArtistTopTags.mockRejectedValue(new Error('API error'))

        const fetcher = createArtistTagFetcher()
        const result = await fetcher('Unknown Artist')

        expect(result).toEqual([])
    })

    it('uses spotify fallback when Last.fm returns empty and fallback provided', async () => {
        getArtistTopTags.mockResolvedValue([])
        const spotifyFallback = jest
            .fn<(artist: string) => Promise<string[]>>()
            .mockResolvedValue(['pop', 'latin'])

        const fetcher = createArtistTagFetcher(spotifyFallback)
        const result = await fetcher('Bad Bunny')

        expect(getArtistTopTags).toHaveBeenCalledWith('Bad Bunny')
        expect(spotifyFallback).toHaveBeenCalledWith('Bad Bunny')
        expect(result).toEqual(['pop', 'latin'])
    })

    it('does not use spotify fallback when Last.fm has tags', async () => {
        getArtistTopTags.mockResolvedValue(['rock', 'metal'])
        const spotifyFallback = jest
            .fn<(artist: string) => Promise<string[]>>()
            .mockResolvedValue(['pop'])

        const fetcher = createArtistTagFetcher(spotifyFallback)
        const result = await fetcher('Metallica')

        expect(spotifyFallback).not.toHaveBeenCalled()
        expect(result).toEqual(['rock', 'metal'])
    })

    it('handles spotify fallback errors gracefully', async () => {
        getArtistTopTags.mockResolvedValue([])
        const spotifyFallback = jest
            .fn<(artist: string) => Promise<string[]>>()
            .mockRejectedValue(new Error('Spotify API error'))

        const fetcher = createArtistTagFetcher(spotifyFallback)
        const result = await fetcher('Unknown')

        expect(result).toEqual([])
    })

    it('converts spotify fallback non-array result to empty array', async () => {
        getArtistTopTags.mockResolvedValue([])
        const spotifyFallback = jest
            .fn<(artist: string) => Promise<string[]>>()
            .mockResolvedValue(null as unknown as string[])

        const fetcher = createArtistTagFetcher(spotifyFallback)
        const result = await fetcher('Artist')

        expect(result).toEqual([])
    })

    it('caches fallback results same as Last.fm results', async () => {
        getArtistTopTags.mockResolvedValue([])
        const spotifyFallback = jest
            .fn<(artist: string) => Promise<string[]>>()
            .mockResolvedValue(['genre1', 'genre2'])

        const fetcher = createArtistTagFetcher(spotifyFallback)

        const result1 = await fetcher('Artist')
        const result2 = await fetcher('Artist')

        expect(spotifyFallback).toHaveBeenCalledTimes(1)
        expect(result1).toEqual(result2)
    })
})

describe('hasGenreTag', () => {
    it('returns false when tags array is empty', () => {
        expect(hasGenreTag([], ['rock', 'pop'])).toBe(false)
    })

    it('returns true when a tag matches a genre variant', () => {
        expect(hasGenreTag(['sertanejo', 'country'], ['sertanejo'])).toBe(true)
    })

    it('returns false when no tags match', () => {
        expect(hasGenreTag(['rock', 'indie'], ['sertanejo', 'forró'])).toBe(false)
    })

    it('is case-insensitive', () => {
        expect(hasGenreTag(['Sertanejo'], ['sertanejo'])).toBe(true)
        expect(hasGenreTag(['sertanejo'], ['SERTANEJO'])).toBe(true)
    })

    it('trims whitespace from tags and variants', () => {
        expect(hasGenreTag([' sertanejo '], ['sertanejo'])).toBe(true)
    })

    it('returns false when variants array is empty', () => {
        expect(hasGenreTag(['rock'], [])).toBe(false)
    })
})
