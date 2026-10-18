import { describe, expect, it } from '@jest/globals'
import { LyricsService, stripBracketedAnnotations } from './LyricsService'

describe('stripBracketedAnnotations', () => {
    it('removes parentheses and brackets groups', () => {
        expect(stripBracketedAnnotations('Song (feat. X) [HD]')).toBe(
            'Song    ',
        )
    })

    it('removes nested groups completely', () => {
        expect(
            stripBracketedAnnotations('Song (Live (2019 Remaster)) Title'),
        ).toBe('Song   Title')
        expect(stripBracketedAnnotations('Song [Mix (Edit)] end')).toBe(
            'Song   end',
        )
    })

    it('keeps text after an unclosed opener', () => {
        expect(stripBracketedAnnotations('Song (feat. X')).toBe('Song (feat. X')
    })

    it('ignores a stray closer', () => {
        expect(stripBracketedAnnotations('Song) Title')).toBe('Song) Title')
    })

    it('returns empty for a non-string input', () => {
        expect(
            stripBracketedAnnotations(['(a)', 'b'] as unknown as string),
        ).toBe('')
    })

    it('stays linear on long runs of openers', () => {
        const start = Date.now()
        stripBracketedAnnotations('('.repeat(200_000))
        stripBracketedAnnotations('[('.repeat(100_000))
        expect(Date.now() - start).toBeLessThan(500)
    })
})

describe('LyricsService cleanSearchQuery', () => {
    const clean = (q: string): string =>
        new LyricsService()['cleanSearchQuery'](q)

    it('drops annotations, common suffixes and special characters', () => {
        expect(clean('Artist - Song (Live) - Official Video')).toBe(
            'Artist - Song',
        )
        expect(clean('Song [HD] -lyrics!')).toBe('Song')
        expect(clean('Rock & Roll')).toBe('Rock Roll')
    })

    it('stays linear on repeated suffix markers', () => {
        // A non-final newline makes the old `.*$` fail and retry at every
        // marker (quadratic, ~3 s here); the exec + slice version is instant.
        const input = '-mv' + '-4k'.repeat(50_000) + '\nx'
        const start = Date.now()
        expect(clean(input)).toBe('')
        expect(Date.now() - start).toBeLessThan(500)
    })
})
