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
        it('extracts genre tags and filters by minimum word length', () => {
            const track = {
                title: 'The Rock Music Live Performance',
                author: 'Artist',
                description: undefined,
            } as Track

            const tags = extractTags(track)

            // Should contain genre keywords and filter short words
            expect(tags).toContain('rock')
            expect(tags).not.toContain('the')
        })

        it('normalizes uppercase and removes punctuation', () => {
            const track = {
                title: 'Country Song (Remix) [JAZZ remix]',
                author: 'Artist Name',
                description: undefined,
            } as Track

            const tags = extractTags(track)

            expect(tags).toContain('country')
            expect(tags).toContain('jazz')
            expect(tags).not.toContain('(')
            expect(tags).not.toContain('[')
        })

        it('extracts tags from multiple sources: title, description, and author', () => {
            const track = {
                title: 'Rock and Jazz',
                author: 'Rock Artist Metal Man',
                description: 'A funk piece with soul and electronic elements',
            } as Track

            const tags = extractTags(track)

            expect(tags).toContain('rock')
            expect(tags).toContain('jazz')
            expect(tags).toContain('metal')
            expect(tags).toContain('funk')
            expect(tags).toContain('soul')
            expect(tags).toContain('electronic')
        })

        it('combines tags without duplicates even when present in multiple sources', () => {
            const track = {
                title: 'Rock and Jazz',
                author: 'Rock Artist Jazz Man',
                description: 'A rock and jazz fusion piece',
            } as Track

            const tags = extractTags(track)

            const rockCount = tags.filter((t) => t === 'rock').length
            const jazzCount = tags.filter((t) => t === 'jazz').length

            expect(rockCount).toBe(1)
            expect(jazzCount).toBe(1)
        })

        it('returns empty array when no genres match', () => {
            const track = {
                title: 'Some Random Title Here',
                author: 'Unknown Artist',
                description: undefined,
            } as Track

            const tags = extractTags(track)

            expect(tags).toEqual([])
        })

        it('handles track with missing optional fields gracefully', () => {
            const track = {
                title: 'Rock Song',
                author: undefined,
            } as Track

            const tags = extractTags(track)

            expect(tags).toContain('rock')
            expect(debugLogMock).not.toHaveBeenCalled()
        })

        it('handles errors during tag extraction and logs them', () => {
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

        it.each([
            ['rock', 'Rock Music Band'],
            ['funk', 'Funk Music Band'],
            ['electronic', 'Electronic Dance Music'],
            ['acoustic', 'Acoustic Music Band'],
            ['instrumental', 'Instrumental Piece Performance'],
        ])('extracts %s genre from track title', (expectedGenre, title) => {
            const track = {
                title,
                author: 'Artist',
                description: undefined,
            } as Track

            const tags = extractTags(track)

            expect(tags).toContain(expectedGenre)
        })
    })

    describe('extractGenre', () => {
        it('returns first matching genre when multiple genres present in track metadata', () => {
            const track = {
                title: 'Rock Jazz Classical',
                author: 'Artist',
                description: undefined,
            } as Track

            const genre = extractGenre(track)

            // Should return one of the genres present
            expect(['rock', 'jazz', 'classical']).toContain(genre)
            expect(genre).toBeDefined()
        })

        it('prioritizes genres in order of discovery: title -> description -> author', () => {
            const track = {
                title: 'Rock Music',
                author: 'Pop Singer',
                description: 'Jazz influenced piece',
            } as Track

            const genre = extractGenre(track)

            // Rock appears first (in title), so it should be returned
            expect(genre).toBe('rock')
        })

        it('returns undefined when no genres match the known genre list', () => {
            const track = {
                title: 'Some Random Title Here',
                author: 'Unknown Artist Name',
                description: undefined,
            } as Track

            const genre = extractGenre(track)

            expect(genre).toBeUndefined()
        })

        it('extracts genre from description when not in title or author', () => {
            const track = {
                title: 'Title',
                author: 'Artist',
                description: 'Electronic Dance Music track',
            } as Track

            const genre = extractGenre(track)

            expect(genre).toBe('electronic')
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
