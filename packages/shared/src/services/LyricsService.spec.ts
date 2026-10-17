import { describe, expect, it } from '@jest/globals'
import { stripBracketedAnnotations } from './LyricsService'

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
