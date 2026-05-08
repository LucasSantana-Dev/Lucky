import { jest } from '@jest/globals'
import { hasGenreTag, createArtistTagFetcher } from './artistTagCache'

jest.mock('../../../lastfm', () => ({
    getArtistTopTags: jest.fn(),
}))

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

describe('createArtistTagFetcher', () => {
    it('returns an empty array for undefined artist', async () => {
        const fetcher = createArtistTagFetcher()
        const result = await fetcher(undefined)
        expect(result).toEqual([])
    })

    it('returns an empty array for empty string artist', async () => {
        const fetcher = createArtistTagFetcher()
        const result = await fetcher('')
        expect(result).toEqual([])
    })

    it('returns an empty array for whitespace-only artist', async () => {
        const fetcher = createArtistTagFetcher()
        const result = await fetcher('   ')
        expect(result).toEqual([])
    })

    it('fetches and caches tags for a known artist', async () => {
        const { getArtistTopTags } = require('../../../lastfm')
        ;(getArtistTopTags as jest.Mock).mockResolvedValue(['rock', 'indie'])

        const fetcher = createArtistTagFetcher()
        const result1 = await fetcher('Radiohead')
        const result2 = await fetcher('radiohead')

        expect(result1).toEqual(['rock', 'indie'])
        expect(result2).toEqual(['rock', 'indie'])
        expect((getArtistTopTags as jest.Mock).mock.calls.length).toBe(1)
    })

    it('returns empty array when Last.fm fetch fails', async () => {
        const { getArtistTopTags } = require('../../../lastfm')
        ;(getArtistTopTags as jest.Mock).mockRejectedValue(new Error('API down'))

        const fetcher = createArtistTagFetcher()
        const result = await fetcher('Some Artist')

        expect(result).toEqual([])
    })
})
