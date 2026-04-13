import { describe, it, expect } from '@jest/globals'
import {
    cleanTitle,
    cleanAuthor,
    cleanSearchQuery,
    isSpamChannel,
    extractSongCore,
} from './searchQueryCleaner'

describe('cleanTitle', () => {
    it('strips (Official Video) noise', () => {
        expect(cleanTitle('Bohemian Rhapsody (Official Video)')).toBe(
            'Bohemian Rhapsody',
        )
    })

    it('strips [Official Music Video] bracketed noise', () => {
        expect(cleanTitle('Sunshine [Official Music Video]')).toBe('Sunshine')
    })

    it('strips [Download] tags', () => {
        // Real case from the production crash report.
        expect(cleanTitle('GOLDEN - HUNTR/X [Download]')).toBe(
            'GOLDEN - HUNTR/X',
        )
    })

    it('strips (Remastered YYYY) variants', () => {
        expect(cleanTitle('Sunshine (Remastered 2022)')).toBe('Sunshine')
        expect(cleanTitle('Sunshine (Remastered)')).toBe('Sunshine')
    })

    it('strips (HD) / (4K) / (Extended) decorators', () => {
        expect(cleanTitle('Song (HD)')).toBe('Song')
        expect(cleanTitle('Song (4K)')).toBe('Song')
        expect(cleanTitle('Song (Extended Mix)')).toBe('Song')
    })

    it('strips "ft." and "feat." prefixes while keeping the featured name', () => {
        expect(cleanTitle('Track ft. Jay-Z')).toBe('Track Jay-Z')
        expect(cleanTitle('Track feat. Jay-Z')).toBe('Track Jay-Z')
    })

    it('removes empty bracket pairs left behind after stripping', () => {
        expect(cleanTitle('Track () [Official Video]')).toBe('Track')
    })

    it('replaces pipe separators with spaces (keeps all informative words)', () => {
        expect(cleanTitle('Song | Movie OST')).toBe('Song Movie OST')
    })

    it('normalizes repeated dashes', () => {
        expect(cleanTitle('Artist - - Song')).toBe('Artist - Song')
    })

    it('collapses repeated whitespace', () => {
        expect(cleanTitle('Song  (HD)  Extended')).toBe('Song Extended')
    })

    it('leaves a clean title alone', () => {
        expect(cleanTitle('Bohemian Rhapsody')).toBe('Bohemian Rhapsody')
    })

    it('handles non-ASCII titles without mangling them', () => {
        expect(cleanTitle('夜に駆ける (Official Video)')).toBe('夜に駆ける')
    })
})

describe('cleanAuthor', () => {
    it('strips " - Topic" YouTube auto-generated suffix', () => {
        expect(cleanAuthor('Queen - Topic')).toBe('Queen')
    })

    it('strips VEVO suffix', () => {
        expect(cleanAuthor('QueenVEVO')).toBe('Queen')
        expect(cleanAuthor('Queen VEVO')).toBe('Queen')
    })

    it('leaves a clean author alone', () => {
        expect(cleanAuthor('Queen')).toBe('Queen')
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
        // Title is "GOLDEN - KPOP DEMON HUNTERS - HUNTR/X - Golden Huntrix [Download]"
        // uploaded by channel "Best Songs" — the bridge was searching SoundCloud
        // for the full noisy string and finding nothing. The cleaned query is the
        // seed our fallback retry chain sees.
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
    it('strips (Tradução) variants', () => {
        expect(cleanTitle('Beyoncé - Halo (Tradução)')).toBe('Beyoncé - Halo')
        expect(cleanTitle('Beyoncé - Halo (Tradução/Legendado)')).toBe(
            'Beyoncé - Halo',
        )
        expect(cleanTitle('Beyoncé - Halo (Tradução PT-BR)')).toBe(
            'Beyoncé - Halo',
        )
    })

    it('strips standalone Legendado', () => {
        expect(cleanTitle('Beyoncé - Halo Legendado')).toBe('Beyoncé - Halo')
    })

    it('strips (Clipe Oficial) variants', () => {
        expect(cleanTitle('Beyoncé - Halo (Clipe Oficial)')).toBe(
            'Beyoncé - Halo',
        )
        expect(cleanTitle('Beyoncé - Halo (Clipe Oficial HD)')).toBe(
            'Beyoncé - Halo',
        )
    })

    it('strips hashtags', () => {
        expect(cleanTitle('Beyoncé - Halo #music #lyrics')).toBe(
            'Beyoncé - Halo',
        )
    })

    it('strips bare Lyrics word', () => {
        expect(cleanTitle('Beyoncé - Halo Lyrics')).toBe('Beyoncé - Halo')
    })

    it('strips combined Brazilian noise', () => {
        expect(
            cleanTitle('Beyonce - Halo (Tradução)( legendado)(Clipe Oficial)'),
        ).toBe('Beyonce - Halo')
    })
})

describe('extractSongCore', () => {
    it('extracts right side of Artist - Song', () => {
        expect(extractSongCore('Beyoncé - Halo')).toBe('Halo')
    })

    it('extracts left side when author matches right side (inverted format)', () => {
        expect(
            extractSongCore('Halo - Beyoncé (Lyrics)', 'Beyoncé - Topic'),
        ).toBe('Halo')
    })

    it('extracts right side when author matches left side', () => {
        expect(
            extractSongCore('Beyoncé - Halo (Tradução)', 'Beyoncé - Topic'),
        ).toBe('Halo')
    })

    it('trims secondary separators from the extracted core', () => {
        expect(
            extractSongCore(
                'Beyoncé - Halo - VERSÃO FORROZINHO',
                'Beyoncé - Topic',
            ),
        ).toBe('Halo')
    })

    it('returns null when no separator is found', () => {
        expect(extractSongCore('Bohemian Rhapsody')).toBeNull()
    })

    it('strips noise from title before extracting', () => {
        expect(
            extractSongCore(
                'Beyoncé - Halo (Tradução/Legendado)',
                'Beyoncé - Topic',
            ),
        ).toBe('Halo')
    })

    it('defaults to right side when author does not match either part', () => {
        expect(extractSongCore('Beyoncé - Halo', 'someuploader123')).toBe(
            'Halo',
        )
    })
})

describe('isSpamChannel', () => {
    it('flags "Best Songs" as spam', () => {
        expect(isSpamChannel('Best Songs')).toBe(true)
        expect(isSpamChannel('best songs')).toBe(true)
    })

    it('flags "NCS" / "No Copyright Sounds" as spam', () => {
        expect(isSpamChannel('NCS')).toBe(true)
        expect(isSpamChannel('No Copyright Sounds')).toBe(true)
    })

    it('does not flag legitimate artist channels', () => {
        expect(isSpamChannel('Queen')).toBe(false)
        expect(isSpamChannel('HUNTR/X')).toBe(false)
    })

    it('handles empty author safely', () => {
        expect(isSpamChannel('')).toBe(false)
        expect(isSpamChannel('   ')).toBe(false)
    })
})

describe('cleanTitle — version variant noise patterns', () => {
    it('strips (Live) and (Live Version)', () => {
        expect(cleanTitle('Bohemian Rhapsody (Live)')).toBe('Bohemian Rhapsody')
        expect(cleanTitle('Bohemian Rhapsody (Live Version)')).toBe(
            'Bohemian Rhapsody',
        )
    })

    it('strips (Acoustic) and (Acoustic Version)', () => {
        expect(cleanTitle('Creep (Acoustic)')).toBe('Creep')
        expect(cleanTitle('Creep (Acoustic Version)')).toBe('Creep')
    })

    it('strips (Cover) and (Cover Version)', () => {
        expect(cleanTitle('Hallelujah (Cover)')).toBe('Hallelujah')
    })

    it('strips (Remix) and [Remix]', () => {
        expect(cleanTitle('Blinding Lights (Remix)')).toBe('Blinding Lights')
        expect(cleanTitle('Blinding Lights [Remix]')).toBe('Blinding Lights')
    })

    it('strips (Instrumental)', () => {
        expect(cleanTitle('Shape of You (Instrumental)')).toBe('Shape of You')
    })

    it('strips (Explicit Version) and (Clean Version)', () => {
        expect(cleanTitle('Track (Explicit Version)')).toBe('Track')
        expect(cleanTitle('Track (Clean Version)')).toBe('Track')
    })

    it('strips (Deluxe Edition) and (Album Version)', () => {
        expect(cleanTitle('Song (Deluxe Edition)')).toBe('Song')
        expect(cleanTitle('Song (Album Version)')).toBe('Song')
    })

    it('strips (Single Version) and (Bonus Track)', () => {
        expect(cleanTitle('Track (Single Version)')).toBe('Track')
        expect(cleanTitle('Track (Bonus Track)')).toBe('Track')
    })
})

describe('cleanTitle — hyphenated version suffixes', () => {
    it('strips " – 2011 Remaster" en-dash suffix', () => {
        expect(cleanTitle('Bohemian Rhapsody – 2011 Remaster')).toBe(
            'Bohemian Rhapsody',
        )
    })

    it('strips " - Live" hyphen suffix', () => {
        expect(cleanTitle('Song Title - Live')).toBe('Song Title')
    })

    it('leaves non-keyword suffix unchanged', () => {
        expect(cleanTitle('Song Title - Some Other Suffix')).toBe(
            'Song Title - Some Other Suffix',
        )
    })

    it('handles already-parenthetical versions', () => {
        expect(cleanTitle('Song Title (Live)')).toBe('Song Title')
    })

    it('strips " — 2020 Remastered" em-dash suffix', () => {
        expect(cleanTitle('Classic Song — 2020 Remastered')).toBe(
            'Classic Song',
        )
    })

    it('does not strip suffix when no separator found', () => {
        expect(cleanTitle('Song Title Remaster')).toBe('Song Title Remaster')
    })

    it('strips " - Acoustic" suffix', () => {
        expect(cleanTitle('Track - Acoustic')).toBe('Track')
    })

    it('strips " - Extended" suffix', () => {
        expect(cleanTitle('Track - Extended')).toBe('Track')
    })

    it('strips " - Radio Edit" suffix', () => {
        expect(cleanTitle('Track - Radio Edit')).toBe('Track')
    })

    it('strips " - Demo" suffix', () => {
        expect(cleanTitle('Track - Demo')).toBe('Track')
    })

    it('strips " - Album Version" suffix', () => {
        expect(cleanTitle('Track - Album Version')).toBe('Track')
    })

    it('strips " - Single Version" suffix', () => {
        expect(cleanTitle('Track - Single Version')).toBe('Track')
    })

    it('strips year-suffix remaster: "Song - Remastered 2011" → "Song"', () => {
        expect(cleanTitle('Bohemian Rhapsody - Remastered 2011')).toBe(
            'Bohemian Rhapsody',
        )
    })

    it('strips year-only: "Song - 2024" → "Song"', () => {
        expect(cleanTitle('Track - 2024')).toBe('Track')
    })

    it('strips original mix: "Song - Original Mix" → "Song"', () => {
        expect(cleanTitle('Electronic Track - Original Mix')).toBe(
            'Electronic Track',
        )
    })

    it('strips original version: "Song - Original Version" → "Song"', () => {
        expect(cleanTitle('Classic Song - Original Version')).toBe(
            'Classic Song',
        )
    })

    it('preserves normal title: "Song Name" → "Song Name"', () => {
        expect(cleanTitle('Song Name')).toBe('Song Name')
    })

    it('strips " - Versão Forró" suffix', () => {
        expect(cleanTitle('Halo - Versão Forró')).toBe('Halo')
    })

    it('strips " - Versão Acústica" suffix', () => {
        expect(cleanTitle('Let Her Go - Versão Acústica')).toBe('Let Her Go')
    })

    it('strips "(Versão Forró)" parenthetical', () => {
        expect(cleanTitle('Halo (Versão Forró)')).toBe('Halo')
    })

    it('strips " - Ao Vivo" suffix', () => {
        expect(cleanTitle('Evidências - Ao Vivo')).toBe('Evidências')
    })

    it('strips " - Ao Vivo em São Paulo" long suffix', () => {
        expect(cleanTitle('Garota de Ipanema - Ao Vivo em São Paulo')).toBe(
            'Garota de Ipanema',
        )
    })

    it('strips "(Ao Vivo)" parenthetical', () => {
        expect(cleanTitle('Evidências (Ao Vivo)')).toBe('Evidências')
    })

    it('strips " - Forró" suffix', () => {
        expect(cleanTitle('Shape of You - Forró')).toBe('Shape of You')
    })

    it('leaves artist-prefixed title unchanged when second suffix is not standalone', () => {
        expect(cleanTitle('Beyoncé - Halo - Versão Forró')).toBe(
            'Beyoncé - Halo - Versão Forró',
        )
    })
})
