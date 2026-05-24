import { describe, it, expect } from '@jest/globals'
import {
    cleanTitle,
    cleanAuthor,
    cleanSearchQuery,
    isSpamChannel,
    extractSongCore,
} from './searchQueryCleaner'

describe('cleanTitle', () => {
    it.each([
        [
            'strips (Official Video) noise',
            'Bohemian Rhapsody (Official Video)',
            'Bohemian Rhapsody',
        ],
        [
            'strips [Official Music Video] bracketed',
            'Sunshine [Official Music Video]',
            'Sunshine',
        ],
        [
            'strips [Download] tags',
            'GOLDEN - HUNTR/X [Download]',
            'GOLDEN - HUNTR/X',
        ],
        ['strips (Remastered YYYY)', 'Sunshine (Remastered 2022)', 'Sunshine'],
        ['strips (HD)/(4K)/(Extended)', 'Song (HD)', 'Song'],
        ['strips "ft." prefix', 'Track ft. Jay-Z', 'Track Jay-Z'],
        ['removes empty bracket pairs', 'Track () [Official Video]', 'Track'],
        ['replaces pipe separators', 'Song | Movie OST', 'Song Movie OST'],
        ['normalizes repeated dashes', 'Artist - - Song', 'Artist - Song'],
        [
            'collapses repeated whitespace',
            'Song  (HD)  Extended',
            'Song Extended',
        ],
        ['leaves clean title alone', 'Bohemian Rhapsody', 'Bohemian Rhapsody'],
        [
            'handles non-ASCII titles',
            '夜に駆ける (Official Video)',
            '夜に駆ける',
        ],
        ['strips (Sped Up)', 'Flowers (Sped Up)', 'Flowers'],
        ['strips (Reverb)', 'Flowers (Reverb)', 'Flowers'],
        ['strips legendado', 'Song legendado', 'Song'],
    ])('%s', (_, input, expected) => {
        expect(cleanTitle(input)).toBe(expected)
    })
})

describe('cleanAuthor', () => {
    it.each([
        ['strips " - Topic" suffix', 'Queen - Topic', 'Queen'],
        ['strips QueenVEVO', 'QueenVEVO', 'Queen'],
        ['strips Queen VEVO', 'Queen VEVO', 'Queen'],
        ['leaves clean author alone', 'Queen', 'Queen'],
    ])('%s', (_, input, expected) => {
        expect(cleanAuthor(input)).toBe(expected)
    })
})

describe('cleanSearchQuery', () => {
    it('combines cleaned title and cleaned author', () => {
        expect(
            cleanSearchQuery(
                'Bohemian Rhapsody (Official Video)',
                'Queen - Topic',
            ),
        ).toBe('Bohemian Rhapsody Queen')
    })

    it('returns title only when author is empty after cleaning', () => {
        expect(cleanSearchQuery('Track (Official)', '- Topic')).toBe('Track')
    })

    it('returns author only when title is empty after cleaning', () => {
        expect(cleanSearchQuery('(Official Video)', 'Queen')).toBe('Queen')
    })

    it('returns empty when both fields are pure noise', () => {
        expect(cleanSearchQuery('(Official Video)', '- Topic')).toBe('')
    })

    it('handles the GOLDEN/HUNTR/X production crash case', () => {
        const cleaned = cleanSearchQuery(
            'GOLDEN - KPOP DEMON HUNTERS - HUNTR/X - Golden Huntrix [Download]',
            'Best Songs',
        )
        expect(cleaned).not.toContain('[Download]')
        expect(cleaned).toContain('GOLDEN')
        expect(cleaned).toContain('HUNTR/X')
    })
})

describe('cleanTitle — Brazilian noise', () => {
    it.each([
        ['strips (Tradução)', 'Beyoncé - Halo (Tradução)', 'Beyoncé - Halo'],
        [
            'strips standalone Legendado',
            'Beyoncé - Halo Legendado',
            'Beyoncé - Halo',
        ],
        [
            'strips (Clipe Oficial)',
            'Beyoncé - Halo (Clipe Oficial)',
            'Beyoncé - Halo',
        ],
        ['strips hashtags', 'Beyoncé - Halo #music #lyrics', 'Beyoncé - Halo'],
        [
            'strips combined Brazilian noise',
            'Beyonce - Halo (Tradução)( legendado)(Clipe Oficial)',
            'Beyonce - Halo',
        ],
    ])('%s', (_, input, expected) => {
        expect(cleanTitle(input)).toBe(expected)
    })
})

describe('extractSongCore', () => {
    it.each([
        ['extracts right side', 'Beyoncé - Halo', undefined, 'Halo'],
        [
            'extracts left when author matches right (inverted)',
            'Halo - Beyoncé (Lyrics)',
            'Beyoncé - Topic',
            'Halo',
        ],
        [
            'extracts right when author matches left',
            'Beyoncé - Halo (Tradução)',
            'Beyoncé - Topic',
            'Halo',
        ],
        [
            'trims secondary separators',
            'Beyoncé - Halo - VERSÃO FORROZINHO',
            'Beyoncé - Topic',
            'Halo',
        ],
        [
            'returns null when no separator',
            'Bohemian Rhapsody',
            undefined,
            null,
        ],
        [
            'strips noise before extracting',
            'Beyoncé - Halo (Tradução/Legendado)',
            'Beyoncé - Topic',
            'Halo',
        ],
        [
            'defaults right when author unmatched',
            'Beyoncé - Halo',
            'someuploader123',
            'Halo',
        ],
        [
            'preserves secondary sep in parenthetical',
            'Alice In Chains - Nutshell (MTV Unplugged - HD Video)',
            'Alice In Chains',
            'Nutshell',
        ],
        [
            'trims bare secondary sep before paren',
            'Pearl Jam - Black - Edit (2019)',
            'Pearl Jam',
            'Black',
        ],
    ])('%s', (_, input, author, expected) => {
        if (author === undefined) {
            expect(extractSongCore(input)).toBe(expected)
        } else {
            expect(extractSongCore(input, author)).toBe(expected)
        }
    })
})

describe('cleanTitle — unplugged and hd video noise patterns', () => {
    it.each([
        ['strips (Unplugged)', 'Nutshell (Unplugged)', 'Nutshell'],
        ['strips [Unplugged]', 'Nutshell [Unplugged]', 'Nutshell'],
        ['strips (MTV Unplugged)', 'Nutshell (MTV Unplugged)', 'Nutshell'],
        ['strips (HD Video)', 'Nutshell (HD Video)', 'Nutshell'],
    ])('%s', (_, input, expected) => {
        expect(cleanTitle(input)).toBe(expected)
    })
})

describe('isSpamChannel', () => {
    it.each([
        ['flags "Best Songs"', 'Best Songs', true],
        ['flags "best songs" (case-insensitive)', 'best songs', true],
        ['flags "NCS"', 'NCS', true],
        ['flags "No Copyright Sounds"', 'No Copyright Sounds', true],
        ['does not flag legitimate artist', 'Queen', false],
        ['does not flag another artist', 'HUNTR/X', false],
        ['handles empty author', '', false],
        ['handles whitespace-only author', '   ', false],
    ])('%s', (_, input, expected) => {
        expect(isSpamChannel(input)).toBe(expected)
    })
})

describe('cleanTitle — version variant noise patterns', () => {
    it.each([
        ['strips (Live)', 'Bohemian Rhapsody (Live)', 'Bohemian Rhapsody'],
        ['strips (Acoustic)', 'Creep (Acoustic)', 'Creep'],
        ['strips (Cover)', 'Hallelujah (Cover)', 'Hallelujah'],
        ['strips (Remix)', 'Blinding Lights (Remix)', 'Blinding Lights'],
        [
            'strips (Instrumental)',
            'Shape of You (Instrumental)',
            'Shape of You',
        ],
        ['strips (Explicit Version)', 'Track (Explicit Version)', 'Track'],
        ['strips (Deluxe Edition)', 'Song (Deluxe Edition)', 'Song'],
        ['strips (Bonus Track)', 'Track (Bonus Track)', 'Track'],
    ])('%s', (_, input, expected) => {
        expect(cleanTitle(input)).toBe(expected)
    })
})

describe('cleanTitle — hyphenated version suffixes', () => {
    it.each([
        [
            'strips " – 2011 Remaster" en-dash',
            'Bohemian Rhapsody – 2011 Remaster',
            'Bohemian Rhapsody',
        ],
        ['strips " - Live" hyphen', 'Song Title - Live', 'Song Title'],
        [
            'leaves non-keyword suffix',
            'Song Title - Some Other Suffix',
            'Song Title - Some Other Suffix',
        ],
        [
            'does not strip missing separator',
            'Song Title Remaster',
            'Song Title Remaster',
        ],
        ['strips " - Acoustic"', 'Track - Acoustic', 'Track'],
        ['strips " - Radio Edit"', 'Track - Radio Edit', 'Track'],
        [
            'strips year-remaster suffix',
            'Bohemian Rhapsody - Remastered 2011',
            'Bohemian Rhapsody',
        ],
        ['strips year-only', 'Track - 2024', 'Track'],
        [
            'strips original mix',
            'Electronic Track - Original Mix',
            'Electronic Track',
        ],
        ['preserves normal title', 'Song Name', 'Song Name'],
        ['strips " - Versão Forró"', 'Halo - Versão Forró', 'Halo'],
        ['strips " - Ao Vivo"', 'Evidências - Ao Vivo', 'Evidências'],
        [
            'strips long Ao Vivo',
            'Garota de Ipanema - Ao Vivo em São Paulo',
            'Garota de Ipanema',
        ],
        ['strips " - Forró"', 'Shape of You - Forró', 'Shape of You'],
        [
            'leaves artist-prefixed with multi-suffix',
            'Beyoncé - Halo - Versão Forró',
            'Beyoncé - Halo - Versão Forró',
        ],
    ])('%s', (_, input, expected) => {
        expect(cleanTitle(input)).toBe(expected)
    })
})

describe('cleanTitle — Acústico variants', () => {
    it.each([
        [
            'strips "(Acústico ao vivo)"',
            'ANATOMIA - Eu sei que é você (Acústico ao vivo)',
            'ANATOMIA - Eu sei que é você',
        ],
        ['strips "- Acústico" suffix', 'Música - Acústico', 'Música'],
    ])('%s', (_, input, expected) => {
        expect(cleanTitle(input)).toBe(expected)
    })
})

describe('cleanTitle — Cover variants', () => {
    it.each([
        ['strips "(Cover)"', 'Hallelujah (Cover)', 'Hallelujah'],
        [
            'strips "(Cover by Someone)"',
            'Água viva (Cover by Carlos)',
            'Água viva',
        ],
        ['strips "- Cover" suffix', 'Água viva - Cover', 'Água viva'],
    ])('%s', (_, input, expected) => {
        expect(cleanTitle(input)).toBe(expected)
    })
})

describe('cleanTitle — tribute and duration annotation noise', () => {
    it.each([
        [
            'strips "(Tributo ao Batman)"',
            'Pearl Jam - Sirens (Tributo ao Batman)',
            'Pearl Jam - Sirens',
        ],
        [
            'strips HH:MM:SS duration',
            'Pearl Jam - Sirens (Legendado) (07:05:14)',
            'Pearl Jam - Sirens',
        ],
        ['leaves MM:SS intact', 'Song Title (03:42)', 'Song Title (03:42)'],
    ])('%s', (_, input, expected) => {
        expect(cleanTitle(input)).toBe(expected)
    })
})
