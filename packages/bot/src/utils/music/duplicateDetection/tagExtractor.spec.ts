import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { extractTags, extractGenre } from './tagExtractor'
import type { Track } from 'discord-player'

const debugLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
}))

describe('tagExtractor', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('extractTags', () => {
        it('extracts genre tags from track title', () => {
            const track = {
                title: 'Rock Song Live Performance',
                author: 'Artist',
                description: undefined,
            } as Track

            const tags = extractTags(track)

            expect(tags).toContain('rock')
        })

        it('handles title with special characters and punctuation', () => {
            const track = {
                title: 'Country Song (Remix)',
                author: 'Artist Name',
                description: undefined,
            } as Track

            const tags = extractTags(track)

            expect(tags).toContain('country')
            expect(tags).not.toContain('(')
            expect(tags).not.toContain(')')
        })

        it('excludes words with 3 or fewer characters', () => {
            const track = {
                title: 'The Soul Music',
                author: 'Artist',
                description: undefined,
            } as Track

            const tags = extractTags(track)

            expect(tags).toContain('soul')
            expect(tags).not.toContain('the')
        })

        it('includes words with 4 or more characters', () => {
            const track = {
                title: 'Rock Song Classical Piece',
                author: 'Artist',
                description: undefined,
            } as Track

            const tags = extractTags(track)

            expect(tags).toContain('rock')
            expect(tags).toContain('classical')
        })

        it('normalizes uppercase to lowercase for matching', () => {
            const track = {
                title: 'ROCK SONG JAZZ MUSIC',
                author: 'Artist',
                description: undefined,
            } as Track

            const tags = extractTags(track)

            expect(tags).toContain('rock')
            expect(tags).toContain('jazz')
        })

        it('extracts tags from description when present', () => {
            const track = {
                title: 'Song Title',
                author: 'Artist',
                description: 'A wonderful jazz piece with soul',
            } as Track

            const tags = extractTags(track)

            expect(tags).toContain('jazz')
            expect(tags).toContain('soul')
        })

        it('extracts tags from author field', () => {
            const track = {
                title: 'Song Title',
                author: 'Rock Band Metal Artists',
                description: undefined,
            } as Track

            const tags = extractTags(track)

            expect(tags).toContain('rock')
            expect(tags).toContain('metal')
        })

        it('handles track with no description field', () => {
            const track = {
                title: 'Rock Song',
                author: 'Artist',
            } as Track

            const tags = extractTags(track)

            expect(tags).toContain('rock')
            expect(debugLogMock).not.toHaveBeenCalled()
        })

        it('returns empty array when no genres match', () => {
            const track = {
                title: 'Some Random Title',
                author: 'Unknown Artist',
                description: undefined,
            } as Track

            const tags = extractTags(track)

            expect(tags).toEqual([])
        })

        it('handles errors gracefully and logs them', () => {
            const track = {
                title: 'Rock Song',
                author: 'Artist',
                get description() {
                    throw new Error('Property access error')
                },
            } as any

            const tags = extractTags(track)

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Error extracting tags'),
                }),
            )
        })

        it('handles null/undefined author gracefully', () => {
            const track = {
                title: 'Rock Song',
                author: undefined,
                description: undefined,
            } as any

            const tags = extractTags(track)

            expect(tags).toContain('rock')
        })

        it('combines tags from multiple sources without duplicates', () => {
            const track = {
                title: 'Rock and Jazz',
                author: 'Rock Artist Jazz Man',
                description: 'A rock and jazz fusion piece with soul',
            } as Track

            const tags = extractTags(track)

            const rockCount = tags.filter((t) => t === 'rock').length
            const jazzCount = tags.filter((t) => t === 'jazz').length

            expect(rockCount).toBe(1)
            expect(jazzCount).toBe(1)
        })

        it('extracts funk genre from track with sufficient word length', () => {
            const track = {
                title: 'Funk Music Band Song',
                author: 'Artist',
                description: undefined,
            } as Track

            const tags = extractTags(track)

            expect(tags).toContain('funk')
        })
    })

    describe('extractGenre', () => {
        it('returns first matching genre from tags', () => {
            const track = {
                title: 'Rock Song Jazz Piece',
                author: 'Artist',
                description: undefined,
            } as Track

            const genre = extractGenre(track)

            expect(genre).toBeDefined()
            expect(['rock', 'jazz']).toContain(genre)
        })

        it('returns undefined when no genres in tags', () => {
            const track = {
                title: 'Some Random Title',
                author: 'Unknown Artist',
                description: undefined,
            } as Track

            const genre = extractGenre(track)

            expect(genre).toBeUndefined()
        })

        it('returns undefined for empty tag array', () => {
            const track = {
                title: 'No genres here xyz',
                author: 'Unknown',
                description: undefined,
            } as Track

            const genre = extractGenre(track)

            expect(genre).toBeUndefined()
        })

        it('returns genre from description tags', () => {
            const track = {
                title: 'Title',
                author: 'Artist',
                description: 'Electronic Dance Music track',
            } as Track

            const genre = extractGenre(track)

            expect(genre).toBe('electronic')
        })

        it('prioritizes genres in order of discovery', () => {
            const track = {
                title: 'Rock Music',
                author: 'Pop Singer',
                description: 'Jazz influenced piece',
            } as Track

            const genre = extractGenre(track)

            expect(genre).toBe('rock')
        })

        it('returns first genre from tag list when multiple genres present', () => {
            const track = {
                title: 'Rock Jazz Classical',
                author: 'Artist',
                description: undefined,
            } as Track

            const genre = extractGenre(track)

            expect(['rock', 'jazz', 'classical']).toContain(genre)
        })

        it('handles tracks with acoustic in title', () => {
            const track = {
                title: 'Acoustic Music Band',
                author: 'Artist',
                description: undefined,
            } as Track

            const genre = extractGenre(track)

            expect(genre).toBe('acoustic')
        })

        it('extracts instrumental from tag list', () => {
            const track = {
                title: 'Instrumental Piece Performance',
                author: 'Artist',
                description: undefined,
            } as Track

            const genre = extractGenre(track)

            expect(genre).toBe('instrumental')
        })

        it('matches genres case-insensitively', () => {
            const track = {
                title: 'ROCK MUSIC PIECE',
                author: 'ARTIST NAME',
                description: undefined,
            } as Track

            const genre = extractGenre(track)

            expect(genre).toBe('rock')
        })
    })
})
