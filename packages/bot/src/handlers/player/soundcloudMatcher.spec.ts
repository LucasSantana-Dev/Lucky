import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { PassThrough } from 'stream'

// --- mocks ---
const mockSearch = jest.fn()
const mockStream = jest.fn()
const mockGetFreeClientID = jest.fn()
const mockSetToken = jest.fn()
const mockInfoLog = jest.fn()
const mockWarnLog = jest.fn()
const mockStreamViaYtDlp = jest.fn()

jest.mock('play-dl', () => ({
    search: (...args: unknown[]) => mockSearch(...args),
    stream: (...args: unknown[]) => mockStream(...args),
    getFreeClientID: (...args: unknown[]) => mockGetFreeClientID(...args),
    setToken: (...args: unknown[]) => mockSetToken(...args),
}))
jest.mock('./ytdlpProcess', () => ({
    streamViaYtDlp: (...args: unknown[]) => mockStreamViaYtDlp(...args),
}))
jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => mockInfoLog(...args),
    warnLog: (...args: unknown[]) => mockWarnLog(...args),
}))

import {
    streamViaSoundCloud,
    findMatchingSoundCloudResult,
    parseDurationString,
    __resetSoundCloudRefreshStateForTests,
} from './soundcloudMatcher.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(
    name: string,
    durationInSec?: number,
): { name: string; url: string; durationInSec?: number } {
    return { name, url: `https://soundcloud.com/artist/${name}`, durationInSec }
}

const fakeReadable = new PassThrough()

// ---------------------------------------------------------------------------
// parseDurationString
// ---------------------------------------------------------------------------

describe('parseDurationString', () => {
    it('returns null for undefined', () => {
        expect(parseDurationString(undefined)).toBeNull()
    })

    it('returns null for empty string', () => {
        expect(parseDurationString('')).toBeNull()
    })

    it('parses MM:SS format', () => {
        expect(parseDurationString('3:30')).toBe(210)
    })

    it('parses HH:MM:SS format', () => {
        expect(parseDurationString('1:02:03')).toBe(3723)
    })

    it('handles zero-padded values', () => {
        expect(parseDurationString('0:05')).toBe(5)
    })

    it('returns null for non-numeric parts', () => {
        expect(parseDurationString('3:xx')).toBeNull()
    })

    it('returns null for a single segment (no colons)', () => {
        expect(parseDurationString('123')).toBeNull()
    })

    it('returns null for four-segment duration', () => {
        expect(parseDurationString('1:2:3:4')).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// findMatchingSoundCloudResult — title matching
// ---------------------------------------------------------------------------

describe('findMatchingSoundCloudResult – title matching', () => {
    it('matches when all query tokens are in the result name', () => {
        const results = [makeResult('Song Name By Artist')]
        expect(
            findMatchingSoundCloudResult('song name', undefined, results),
        ).toBe(results[0])
    })

    it('returns undefined when query normalizes to empty', () => {
        const results = [makeResult('Song')]
        expect(
            findMatchingSoundCloudResult('!!!', undefined, results),
        ).toBeUndefined()
    })

    it('returns undefined when no result meets the 75% token threshold', () => {
        // query has 4 tokens, result matches only 1 (25%)
        const results = [makeResult('Song')]
        expect(
            findMatchingSoundCloudResult(
                'song name by artist',
                undefined,
                results,
            ),
        ).toBeUndefined()
    })

    it('matches when exactly 75% of tokens are present', () => {
        // 4 tokens, 3 matched = 75%
        const results = [makeResult('Song Name By')]
        expect(
            findMatchingSoundCloudResult(
                'song name by artist',
                undefined,
                results,
            ),
        ).toBe(results[0])
    })

    it('strips punctuation before comparing', () => {
        const results = [makeResult('Song: The Remix')]
        expect(
            findMatchingSoundCloudResult('song the remix', undefined, results),
        ).toBe(results[0])
    })

    it('is case-insensitive', () => {
        const results = [makeResult('SONG NAME')]
        expect(
            findMatchingSoundCloudResult('Song Name', undefined, results),
        ).toBe(results[0])
    })

    it('skips results whose normalized name is empty', () => {
        const results = [makeResult('!!!')]
        expect(
            findMatchingSoundCloudResult('song name', undefined, results),
        ).toBeUndefined()
    })
})

// ---------------------------------------------------------------------------
// findMatchingSoundCloudResult — duration matching
// ---------------------------------------------------------------------------

describe('findMatchingSoundCloudResult – accent folding', () => {
    it.each([
        ['Mirándote', 'Mirandote'],
        ['Mirandote', 'Mirándote'],
        ['Bésame', 'Besame'],
        ['NO BATIDÃO', 'No Batidao'],
        ['Cuéntame', 'CUENTAME'],
    ])('matches query %s against result %s', (query, name) => {
        const results = [makeResult(name)]
        expect(findMatchingSoundCloudResult(query, undefined, results)).toBe(
            results[0],
        )
    })

    it('still rejects a clearly different title', () => {
        const results = [makeResult('Completamente Diferente')]
        expect(
            findMatchingSoundCloudResult('Mirándote', undefined, results),
        ).toBeUndefined()
    })

    it('still rejects a match more than 30 seconds off', () => {
        const results = [makeResult('Mirandote', 400)]
        expect(
            findMatchingSoundCloudResult('Mirándote', '3:30', results),
        ).toBeUndefined()
    })
})

describe('findMatchingSoundCloudResult – parenthetical title suffixes (#2866)', () => {
    // Real production failures: Spotify sends titles with comment/version
    // parentheticals that SoundCloud lists without them. The extra tokens
    // drove the score below the 0.75 threshold.
    it.each([
        [
            'Sobre Pra Você Guardei o Amor (Comentário)',
            'Sobre Pra Voce Guardei o Amor',
        ],
        ['Ai Se Eu Te Pego (En Vivo)', 'Ai Se Eu Te Pego'],
        ['Shallow (From "A Star Is Born")', 'Shallow'],
        ['Song Title (12" Version)', 'Song Title'],
        ['My Song (karaokê)', 'My Song'],
        ['Track [Live Version]', 'Track'],
    ])(
        'query with suffix "%s" matches clean SoundCloud result "%s"',
        (query, name) => {
            const results = [{ name, url: 'https://soundcloud.com/x' }]
            expect(
                findMatchingSoundCloudResult(query, undefined, results),
            ).toBe(results[0])
        },
    )

    it('still rejects a clearly different title even when parentheticals are stripped', () => {
        const results = [
            {
                name: 'Completely Different Song',
                url: 'https://soundcloud.com/x',
            },
        ]
        expect(
            findMatchingSoundCloudResult(
                'Ai Se Eu Te Pego (En Vivo)',
                undefined,
                results,
            ),
        ).toBeUndefined()
    })

    it('matches when SoundCloud result also carries the suffix', () => {
        const results = [
            {
                name: 'Ai Se Eu Te Pego (En Vivo)',
                url: 'https://soundcloud.com/x',
            },
        ]
        expect(
            findMatchingSoundCloudResult(
                'Ai Se Eu Te Pego (En Vivo)',
                undefined,
                results,
            ),
        ).toBe(results[0])
    })

    it('duration check still applies after stripping', () => {
        // 3:00 = 180s; result at 300s is 120s off — should be rejected
        const results = [
            {
                name: 'Ai Se Eu Te Pego',
                url: 'https://soundcloud.com/x',
                durationInSec: 300,
            },
        ]
        expect(
            findMatchingSoundCloudResult(
                'Ai Se Eu Te Pego (En Vivo)',
                '3:00',
                results,
            ),
        ).toBeUndefined()
    })
})

describe('findMatchingSoundCloudResult - suffix stripping edge cases (#2866)', () => {
    const url = 'https://soundcloud.com/x'

    it('falls back to the unstripped query when it is entirely bracketed', () => {
        const results = [{ name: 'Intro', url }]
        expect(
            findMatchingSoundCloudResult('(Intro)', undefined, results),
        ).toBe(results[0])
    })

    it('does not strip a title-defining group: prefers the full title', () => {
        const results = [
            { name: 'The Man', url },
            { name: 'The Man Who Sold the World', url },
        ]
        expect(
            findMatchingSoundCloudResult(
                'The Man (Who Sold the World)',
                undefined,
                results,
            ),
        ).toBe(results[1])
    })

    it('does not strip a title-defining (Part II) group when ranking', () => {
        const results = [
            { name: 'The Song', url },
            { name: 'The Song Part II', url },
        ]
        expect(
            findMatchingSoundCloudResult('The Song (Part II)', '3:00', results),
        ).toBe(results[1])
    })

    it('keeps a mid-title group in the scored tokens', () => {
        const results = [{ name: 'Song Extra', url }]
        expect(
            findMatchingSoundCloudResult(
                'Song (Alpha Beta Gamma) Extra',
                undefined,
                results,
            ),
        ).toBeUndefined()
    })

    it('strips nested groups with a linear scan', () => {
        const results = [{ name: 'Song', url }]
        expect(
            findMatchingSoundCloudResult(
                'Song (Live (Acoustic) Version)',
                undefined,
                results,
            ),
        ).toBe(results[0])
        expect(
            findMatchingSoundCloudResult(
                'Song [Live [Acoustic] Version]',
                undefined,
                results,
            ),
        ).toBe(results[0])
    })

    it('treats unmatched delimiters as plain text', () => {
        const results = [{ name: 'Song Live', url }]
        expect(
            findMatchingSoundCloudResult('Song (Live', undefined, results),
        ).toBe(results[0])
    })

    it('handles pathological unclosed input quickly', () => {
        const results = [{ name: 'Song', url }]
        const nasty = 'Song ' + '('.repeat(50_000)
        expect(findMatchingSoundCloudResult(nasty, undefined, results)).toBe(
            results[0],
        )
    })

    it('still prefers the remix when the query asks for (Remix)', () => {
        const results = [
            { name: 'Song Name', url },
            { name: 'Song Name (Remix)', url },
        ]
        expect(
            findMatchingSoundCloudResult(
                'Song Name (Remix)',
                undefined,
                results,
            ),
        ).toBe(results[1])
        expect(
            findMatchingSoundCloudResult('Song Name (Remix)', '3:00', results),
        ).toBe(results[1])
    })

    it('falls back to the plain track when no remix exists', () => {
        const results = [{ name: 'Song Name', url }]
        expect(
            findMatchingSoundCloudResult(
                'Song Name (Remix)',
                undefined,
                results,
            ),
        ).toBe(results[0])
    })
})

describe('findMatchingSoundCloudResult – expected artist', () => {
    const url = 'https://soundcloud.com/x'
    // Real SoundCloud results for the title-only query "Flashing Lights"
    // (2026-10-19). A "kanye west" search resolved Flashing Lights (3:58) on
    // YouTube, yt-dlp failed, and the title-only stage played the only
    // candidate within 30s: someone else's dub.
    const flashingLights = [
        { name: 'Kanye West - Flashing Lights', url, durationInSec: 715 },
        { name: 'Flashing Lights - Kanye West', url, durationInSec: 737 },
        {
            name: 'Flashing Lights',
            url,
            durationInSec: 30,
            user: { name: 'Trace' },
        },
        { name: 'Kanye West - Flashing Lights 2', url, durationInSec: 275 },
        {
            name: 'NØYCEY - FLASHING LIGHTS DUB',
            url,
            durationInSec: 221,
            user: { name: 'NØYCEY' },
        },
    ]

    it('rejects a same-title track by another artist (kanye west regression)', () => {
        expect(
            findMatchingSoundCloudResult(
                'Flashing Lights',
                '03:58',
                flashingLights,
                { expectedArtists: ['Kanye West'] },
            ),
        ).toBeUndefined()
    })

    it('needs the artist even for a plain same-title track', () => {
        const other = [
            {
                name: 'NØYCEY - Flashing Lights',
                url,
                durationInSec: 221,
                user: { name: 'NØYCEY' },
            },
        ]
        expect(
            findMatchingSoundCloudResult('Flashing Lights', '03:58', other),
        ).toBe(other[0])
        expect(
            findMatchingSoundCloudResult('Flashing Lights', '03:58', other, {
                expectedArtists: ['Kanye West'],
            }),
        ).toBeUndefined()
    })

    it('accepts an upload by the artist account without the artist in the title', () => {
        const results = [
            {
                name: 'Flashing Lights',
                url,
                durationInSec: 238,
                user: { name: 'Kanye West' },
            },
        ]
        expect(
            findMatchingSoundCloudResult('Flashing Lights', '03:58', results, {
                expectedArtists: ['Kanye West'],
            }),
        ).toBe(results[0])
    })

    // Real results for the soundcloud-full query of "Lynyrd Skynyrd - Simple
    // Man" (2026-10-19): the official uploads are 30s previews, so a fan
    // upload naming the artist in its title played instead of the original.
    const simpleMan = [
        {
            name: 'Simple Man',
            url,
            durationInSec: 30,
            user: { name: 'Lynyrd Skynyrd' },
        },
        {
            name: '03 Simple man - Lynyrd Skynyrd',
            url,
            durationInSec: 368,
            user: { name: 'Karin Knutsen' },
        },
        {
            name: 'Lynyrd Skynyrd - Simple Man',
            url,
            durationInSec: 460,
            user: { name: 'Nero' },
        },
    ]

    it('rejects an upload that only names the artist in its title (simple man regression)', () => {
        for (const duration of ['05:56', undefined]) {
            expect(
                findMatchingSoundCloudResult(
                    'Lynyrd Skynyrd - Simple Man',
                    duration,
                    simpleMan,
                    { expectedArtists: ['LynyrdSkynyrd', 'Lynyrd Skynyrd'] },
                ),
            ).toBeUndefined()
        }
    })

    it('rejects a result with no uploader when an artist is expected', () => {
        const results = [{ name: 'Kanye West - Flashing Lights', url }]
        expect(
            findMatchingSoundCloudResult(
                'Flashing Lights',
                undefined,
                results,
                {
                    expectedArtists: ['Kanye West'],
                },
            ),
        ).toBeUndefined()
    })

    it('matches the lead artist, accents, joined and official account names', () => {
        const accounts = [
            'kanyewest',
            'Kanye West Official',
            'KanyeWestVEVO',
        ].map((name) => [
            {
                name: 'Flashing Lights',
                url,
                durationInSec: 238,
                user: { name },
            },
        ])
        for (const results of accounts) {
            expect(
                findMatchingSoundCloudResult(
                    'Flashing Lights',
                    '03:58',
                    results,
                    {
                        expectedArtists: ['Kanye West feat. Dwele'],
                    },
                ),
            ).toBe(results[0])
        }
        const accented = [{ name: 'Army of Me', url, user: { name: 'Björk' } }]
        expect(
            findMatchingSoundCloudResult('Army of Me', undefined, accented, {
                expectedArtists: ['Bjork'],
            }),
        ).toBe(accented[0])
        const joinedAuthor = [
            { name: 'Simple Man', url, user: { name: 'Lynyrd Skynyrd' } },
        ]
        expect(
            findMatchingSoundCloudResult(
                'Simple Man',
                undefined,
                joinedAuthor,
                {
                    expectedArtists: ['LynyrdSkynyrd'],
                },
            ),
        ).toBe(joinedAuthor[0])
    })

    it('keeps an artist whose name contains a comma', () => {
        const results = [
            {
                name: 'September',
                url,
                user: { name: 'Earth, Wind & Fire' },
            },
        ]
        expect(
            findMatchingSoundCloudResult('September', undefined, results, {
                expectedArtists: ['Earth, Wind & Fire'],
            }),
        ).toBe(results[0])
    })

    it('accepts any one of several expected artists', () => {
        const results = [
            { name: 'Ben', url, user: { name: 'Michael Jackson' } },
        ]
        expect(
            findMatchingSoundCloudResult('Ben', undefined, results, {
                expectedArtists: ['MoonWalker777', 'Michael Jackson'],
            }),
        ).toBe(results[0])
    })

    it('rejects fan accounts and a split name', () => {
        for (const name of ['kanyewestfan', 'Kanye West Fan', 'West']) {
            const results = [
                {
                    name: 'Kanye - Flashing Lights',
                    url,
                    user: { name },
                },
            ]
            expect(
                findMatchingSoundCloudResult(
                    'Flashing Lights',
                    undefined,
                    results,
                    { expectedArtists: ['Kanye West'] },
                ),
            ).toBeUndefined()
        }
    })

    it('keeps names that start with ft/feat and duos joined by &', () => {
        const ftIsland = [
            { name: 'Love Love Love', url, user: { name: 'Jamie' } },
            { name: 'Love Love Love', url, user: { name: 'FT Island' } },
        ]
        expect(
            findMatchingSoundCloudResult(
                'Love Love Love',
                undefined,
                ftIsland,
                {
                    expectedArtists: ['FT Island'],
                },
            ),
        ).toBe(ftIsland[1])
        const duo = [
            { name: 'The Boxer', url, user: { name: 'Simon' } },
            { name: 'The Boxer', url, user: { name: 'Simon & Garfunkel' } },
        ]
        expect(
            findMatchingSoundCloudResult('The Boxer', undefined, duo, {
                expectedArtists: ['Simon & Garfunkel'],
            }),
        ).toBe(duo[1])
    })

    it('does not let a short artist name match inside another word', () => {
        const results = [
            { name: 'Flashing Lights', url, user: { name: 'Eyes Only' } },
        ]
        expect(
            findMatchingSoundCloudResult(
                'Flashing Lights',
                undefined,
                results,
                { expectedArtists: ['Ye'] },
            ),
        ).toBeUndefined()
    })
})

describe('findMatchingSoundCloudResult – altered versions', () => {
    const url = 'https://soundcloud.com/x'

    // Real results for the soundcloud-full query of "Justin Bieber - Beauty
    // And A Beat (Official Music Video) ft. Nicki Minaj" (2026-10-19): the
    // slowed TikTok edit was the only one near the video's length and played.
    const beautyAndABeat = [
        {
            name: 'Justin Bieber - Beauty And A Beat (feat. Nicki Minaj)',
            url,
            durationInSec: 684,
        },
        { name: 'BEAUTY AND A BEAT (HAWYS REMIX)', url, durationInSec: 237 },
        {
            name: 'Beauty And A Beat- Justin Bieber ft. Nicki Minaj ( Perfect Slowed ) Tiktok Version_160k',
            url,
            durationInSec: 301,
        },
        {
            name: 'Justin Bieber, Nicki Minaj - Beauty And A Beat (KONSTRUKT REBUILD)',
            url,
            durationInSec: 233,
        },
    ]

    it('rejects a slowed edit and an unstructured remix marker (beauty and a beat regression)', () => {
        expect(
            findMatchingSoundCloudResult(
                'Justin Bieber - Beauty And A Beat Nicki Minaj Justin Bieber',
                '04:54',
                beautyAndABeat,
                {
                    sourceTitle:
                        'Justin Bieber - Beauty And A Beat (Official Music Video) ft. Nicki Minaj',
                },
            ),
        ).toBeUndefined()
        expect(
            findMatchingSoundCloudResult(
                'Beauty And A Beat',
                '03:55',
                beautyAndABeat,
            ),
        ).toBeUndefined()
    })

    it('rejects the slowed copy and keeps the plain upload (exile regression)', () => {
        const exile = [
            {
                name: 'exile - taylor swift (slowed)',
                url,
                durationInSec: 286,
                user: { name: 'Taylor Swift' },
            },
            {
                name: 'exile - taylor swift',
                url,
                durationInSec: 276,
                user: { name: 'Taylor Swift' },
            },
        ]
        expect(
            findMatchingSoundCloudResult(
                'Taylor Swift – exile',
                '04:47',
                exile,
                {
                    expectedArtists: ['Taylor Swift'],
                },
            ),
        ).toBe(exile[1])
    })

    it('plays the remix when the source title asked for it', () => {
        const results = [
            {
                name: 'BEAUTY AND A BEAT (HAWYS REMIX)',
                url,
                durationInSec: 237,
            },
        ]
        expect(
            findMatchingSoundCloudResult(
                'Beauty And A Beat',
                '03:55',
                results,
                {
                    sourceTitle: 'Beauty And A Beat (HAWYS Remix)',
                },
            ),
        ).toBe(results[0])
    })

    it('does not treat a version word inside another word as a marker', () => {
        const results = [{ name: 'Dubai Nights - Livewire', url }]
        expect(
            findMatchingSoundCloudResult(
                'Dubai Nights Livewire',
                undefined,
                results,
            ),
        ).toBe(results[0])
    })
})

describe('findMatchingSoundCloudResult – duration matching', () => {
    it('accepts match within 30 seconds of track duration', () => {
        const results = [makeResult('Song', 200)] // 3:20
        expect(findMatchingSoundCloudResult('song', '3:30', results)).toBe(
            results[0],
        )
    })

    it('rejects match more than 30 seconds from track duration', () => {
        const results = [makeResult('Song', 169)] // 31s off
        expect(
            findMatchingSoundCloudResult('song', '3:30', results),
        ).toBeUndefined()
    })

    it('accepts exact boundary (30 seconds off)', () => {
        const results = [makeResult('Song', 180)] // exactly 30s off from 3:30 (210s)
        expect(findMatchingSoundCloudResult('song', '3:30', results)).toBe(
            results[0],
        )
    })

    it('skips duration check when trackDuration is missing', () => {
        const results = [makeResult('Song', 60)]
        expect(findMatchingSoundCloudResult('song', undefined, results)).toBe(
            results[0],
        )
    })

    it('skips duration check when result has no durationInSec', () => {
        const results = [makeResult('Song')]
        expect(findMatchingSoundCloudResult('song', '3:30', results)).toBe(
            results[0],
        )
    })

    it('skips duration check when trackDuration is unparseable', () => {
        const results = [makeResult('Song', 60)]
        expect(
            findMatchingSoundCloudResult('song', 'bad:duration', results),
        ).toBe(results[0])
    })

    it('returns first result that passes both title and duration checks', () => {
        const results = [
            makeResult('Song', 60), // title match, duration fails (150s off 3:30)
            makeResult('Song Name', 200), // title match, duration ok (10s off 3:30)
        ]
        const match = findMatchingSoundCloudResult('song name', '3:30', results)
        expect(match?.name).toBe('Song Name')
    })

    it('prefers the closest duration among multiple qualifying candidates, not just the first', () => {
        const results = [
            makeResult('Song Name (Sped Up)', 195), // 15s off 3:30 (210s)
            makeResult('Song Name', 208), // 2s off — closer, but ranked second by SoundCloud
            makeResult('Song Name (8D Audio)', 225), // 15s off
        ]
        const match = findMatchingSoundCloudResult('song name', '3:30', results)
        expect(match?.name).toBe('Song Name')
    })

    it('picks the first of multiple duration-less candidates when none can be ranked by duration', () => {
        const results = [makeResult('Song Name'), makeResult('Song Name Live')]
        const match = findMatchingSoundCloudResult('song name', '3:30', results)
        expect(match?.name).toBe('Song Name')
    })

    it('prefers an exact title match with no duration data over a looser title match with duration', () => {
        // 4 query tokens: 'song name original mix'. The remix result is
        // missing "original" (3/4 = 75%, just clears the threshold); the
        // duration-less result matches all 4 tokens (100%).
        const results = [
            makeResult('Song Name Mix', 215), // 75% title score, 5s off
            makeResult('Song Name Original Mix'), // 100% title score, no duration data
        ]
        const match = findMatchingSoundCloudResult(
            'song name original mix',
            '3:30',
            results,
        )
        expect(match?.name).toBe('Song Name Original Mix')
    })

    it('at equal title score, prefers the duration-bearing candidate over the duration-less one', () => {
        const results = [
            makeResult('Song Name'), // exact title, no duration
            makeResult('Song Name', 215), // exact title, has duration (5s off)
        ]
        const match = findMatchingSoundCloudResult('song name', '3:30', results)
        expect(match?.durationInSec).toBe(215)
    })

    it('falls back to a candidate with no duration data when it is the only match', () => {
        const results = [makeResult('Song Name')] // no durationInSec at all
        const match = findMatchingSoundCloudResult('song name', '3:30', results)
        expect(match?.name).toBe('Song Name')
    })
})

// ---------------------------------------------------------------------------
// findMatchingSoundCloudResult — unrequested version marker demotion (#2133)
// ---------------------------------------------------------------------------

describe('findMatchingSoundCloudResult – version marker demotion', () => {
    it('prefers a marker-free candidate over a remix that ranked first', () => {
        const results = [
            makeResult('Song Name (Remix)'),
            makeResult('Song Name'),
        ]
        const match = findMatchingSoundCloudResult(
            'song name',
            undefined,
            results,
        )
        expect(match?.name).toBe('Song Name')
    })

    it('still applies the duration tiebreak among marker-free candidates', () => {
        const results = [
            makeResult('Song Name (Remix)', 210), // marker, exact duration
            makeResult('Song Name', 195), // clean, 15s off
            makeResult('Song Name Extra', 215), // clean, 5s off
        ]
        const match = findMatchingSoundCloudResult('song name', '3:30', results)
        expect(match?.name).toBe('Song Name Extra')
    })

    it('falls back to a remaster when nothing else matches', () => {
        const results = [makeResult('Song Name (Remastered 2011)')]
        const match = findMatchingSoundCloudResult(
            'song name',
            undefined,
            results,
        )
        expect(match?.name).toBe('Song Name (Remastered 2011)')
    })

    it('never falls back to a remix the request did not ask for', () => {
        const results = [makeResult('Song Name (Remix)')]
        expect(
            findMatchingSoundCloudResult('song name', undefined, results),
        ).toBeUndefined()
    })

    it('does not demote when the query itself asks for that version', () => {
        const results = [
            makeResult('Song Name (Remix)'),
            makeResult('Song Name'),
        ]
        const match = findMatchingSoundCloudResult(
            'song name remix',
            undefined,
            results,
        )
        expect(match?.name).toBe('Song Name (Remix)')
    })
})

// ---------------------------------------------------------------------------
// streamViaSoundCloud
// ---------------------------------------------------------------------------

describe('streamViaSoundCloud', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        __resetSoundCloudRefreshStateForTests()
        mockStream.mockResolvedValue({ stream: fakeReadable })
        mockGetFreeClientID.mockResolvedValue('fresh-client-id')
        mockSetToken.mockResolvedValue(undefined)
    })

    it('throws on empty query', async () => {
        await expect(streamViaSoundCloud('')).rejects.toThrow(
            'SoundCloud: empty query',
        )
    })

    it('throws on whitespace-only query', async () => {
        await expect(streamViaSoundCloud('   ')).rejects.toThrow(
            'SoundCloud: empty query',
        )
    })

    it('throws when search returns no results', async () => {
        mockSearch.mockResolvedValue([])
        await expect(streamViaSoundCloud('some song', '3:30')).rejects.toThrow(
            'SoundCloud: no results for "some song"',
        )
    })

    it('throws when no result passes title/duration validation', async () => {
        // result name has no tokens in common with query
        mockSearch.mockResolvedValue([makeResult('Completely Different', 300)])
        await expect(streamViaSoundCloud('song name', '3:30')).rejects.toThrow(
            'SoundCloud: no validated match',
        )
    })

    it('says why each candidate was rejected for artist and version', async () => {
        mockSearch.mockResolvedValue([
            makeResult('NØYCEY - FLASHING LIGHTS DUB', 221),
        ])
        await expect(
            streamViaSoundCloud('Flashing Lights', '03:58', {
                expectedArtists: ['Kanye West'],
            }),
        ).rejects.toThrow('SoundCloud: no validated match')
        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    rejected: [
                        expect.objectContaining({
                            artistMatch: false,
                            alteredVersion: true,
                        }),
                    ],
                }),
            }),
        )
    })

    it('logs rejected candidates when nothing validates', async () => {
        mockSearch.mockResolvedValue([makeResult('Completely Different', 300)])
        await expect(streamViaSoundCloud('song name', '3:30')).rejects.toThrow(
            'SoundCloud: no validated match for "song name" (title/duration mismatch)',
        )
        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'SoundCloud: no validated match',
                data: expect.objectContaining({
                    rejected: [
                        {
                            name: 'Completely Different',
                            titleScore: 0,
                            durationDeltaSec: 90,
                        },
                    ],
                }),
            }),
        )
    })

    it('returns the stream for a matching result', async () => {
        mockSearch.mockResolvedValue([makeResult('Song Name By Artist', 210)])
        const result = await streamViaSoundCloud('song name', '3:30')
        expect(result).toBe(fakeReadable)
    })

    it('wraps playdl.stream errors with context', async () => {
        mockSearch.mockResolvedValue([makeResult('Song Name', 210)])
        mockStream.mockRejectedValue(new Error('401 Unauthorized'))
        await expect(streamViaSoundCloud('song name', '3:30')).rejects.toThrow(
            'SoundCloud: stream creation failed for "Song Name" — 401 Unauthorized',
        )
    })

    it('streams the permalink via yt-dlp and skips play-dl', async () => {
        const ytdlpReadable = new PassThrough()
        mockStreamViaYtDlp.mockResolvedValue(ytdlpReadable)
        mockSearch.mockResolvedValue([
            {
                ...makeResult('Song Name', 210),
                permalink: 'https://soundcloud.com/artist/song-name',
            },
        ])

        const result = await streamViaSoundCloud('song name', '3:30')

        expect(result).toBe(ytdlpReadable)
        expect(mockStreamViaYtDlp).toHaveBeenCalledWith(
            'https://soundcloud.com/artist/song-name',
        )
        expect(mockStream).not.toHaveBeenCalled()
    })

    it('falls back to play-dl when yt-dlp fails', async () => {
        mockStreamViaYtDlp.mockRejectedValue(
            new Error('yt-dlp exited with code 1'),
        )
        mockSearch.mockResolvedValue([
            {
                ...makeResult('Song Name', 210),
                permalink: 'https://soundcloud.com/artist/song-name',
            },
        ])

        const result = await streamViaSoundCloud('song name', '3:30')

        expect(result).toBe(fakeReadable)
        expect(mockStream).toHaveBeenCalledTimes(1)
        expect(mockWarnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'SoundCloud: yt-dlp stream failed, trying play-dl',
                data: {
                    track: 'Song Name',
                    error: 'yt-dlp exited with code 1',
                },
            }),
        )
    })

    describe('DRM-protected uploads (2026-10-20)', () => {
        const drmError = new Error(
            'yt-dlp exited with code 1 - ERROR: [soundcloud] 2362723235: This video is DRM protected',
        )
        const drmResult = {
            ...makeResult('Breathe', 210),
            permalink: 'https://soundcloud.com/artist/breathe',
        }

        it('skips play-dl and the client id refresh', async () => {
            mockStreamViaYtDlp.mockRejectedValue(drmError)
            mockSearch.mockResolvedValue([drmResult])

            await expect(
                streamViaSoundCloud('breathe', '3:30'),
            ).rejects.toThrow('SoundCloud: "Breathe" is DRM protected')
            expect(mockStream).not.toHaveBeenCalled()
            expect(mockGetFreeClientID).not.toHaveBeenCalled()
        })

        it('never streams a known DRM upload again', async () => {
            mockStreamViaYtDlp.mockRejectedValue(drmError)
            mockSearch.mockResolvedValue([drmResult])
            await expect(
                streamViaSoundCloud('breathe', '3:30'),
            ).rejects.toThrow('is DRM protected')
            mockStreamViaYtDlp.mockClear()

            await expect(
                streamViaSoundCloud('breathe', '3:30'),
            ).rejects.toThrow(
                'SoundCloud: only DRM-protected results for "breathe"',
            )
            expect(mockStreamViaYtDlp).not.toHaveBeenCalled()
        })

        it('picks another candidate when the best one is DRM', async () => {
            const ytdlpReadable = new PassThrough()
            mockStreamViaYtDlp.mockRejectedValueOnce(drmError)
            mockSearch.mockResolvedValue([drmResult])
            await expect(
                streamViaSoundCloud('breathe', '3:30'),
            ).rejects.toThrow('is DRM protected')

            const other = {
                ...makeResult('Breathe (Official Audio)', 210),
                permalink: 'https://soundcloud.com/artist/breathe-official',
            }
            mockSearch.mockResolvedValue([drmResult, other])
            mockStreamViaYtDlp.mockResolvedValue(ytdlpReadable)

            await expect(streamViaSoundCloud('breathe', '3:30')).resolves.toBe(
                ytdlpReadable,
            )
            expect(mockStreamViaYtDlp).toHaveBeenLastCalledWith(other.permalink)
        })
    })

    it('successfully streams and passes correct search parameters', async () => {
        mockSearch.mockResolvedValue([makeResult('Song Name', 210)])
        const result = await streamViaSoundCloud('song name')

        // Verify the search was called with correct parameters
        expect(mockSearch).toHaveBeenCalledWith('song name', {
            source: { soundcloud: 'tracks' },
            limit: 5,
        })

        // Verify that a stream is returned
        expect(result).toBe(fakeReadable)
    })
})

// ---------------------------------------------------------------------------
// #2139 — the boot-scraped client id expires; the bridge must recover instead
// of failing every fallback for the rest of the process lifetime.
// ---------------------------------------------------------------------------

describe('streamViaSoundCloud – client id refresh', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        __resetSoundCloudRefreshStateForTests()
        mockStream.mockResolvedValue({ stream: fakeReadable })
        mockGetFreeClientID.mockResolvedValue('fresh-client-id')
        mockSetToken.mockResolvedValue(undefined)
    })

    it('refreshes the client id and retries once when search fails', async () => {
        mockSearch
            .mockRejectedValueOnce(new Error('401 Unauthorized'))
            .mockResolvedValueOnce([makeResult('Song Name', 210)])

        const result = await streamViaSoundCloud('song name', '3:30')

        expect(result).toBe(fakeReadable)
        expect(mockGetFreeClientID).toHaveBeenCalledTimes(1)
        expect(mockSetToken).toHaveBeenCalledWith({
            soundcloud: { client_id: 'fresh-client-id' },
        })
        expect(mockSearch).toHaveBeenCalledTimes(2)
    })

    it('refreshes the client id and retries once when stream creation fails', async () => {
        mockSearch.mockResolvedValue([makeResult('Song Name', 210)])
        mockStream
            .mockRejectedValueOnce(new Error('401 Unauthorized'))
            .mockResolvedValueOnce({ stream: fakeReadable })

        const result = await streamViaSoundCloud('song name', '3:30')

        expect(result).toBe(fakeReadable)
        expect(mockGetFreeClientID).toHaveBeenCalledTimes(1)
        expect(mockStream).toHaveBeenCalledTimes(2)
    })

    it('does not refresh when the search succeeds but genuinely has no results', async () => {
        mockSearch.mockResolvedValue([])

        await expect(streamViaSoundCloud('song name', '3:30')).rejects.toThrow(
            'SoundCloud: no results for "song name"',
        )
        expect(mockGetFreeClientID).not.toHaveBeenCalled()
    })

    it('does not refresh when the search succeeds but nothing validates', async () => {
        mockSearch.mockResolvedValue([makeResult('Completely Different', 300)])

        await expect(streamViaSoundCloud('song name', '3:30')).rejects.toThrow(
            'SoundCloud: no validated match',
        )
        expect(mockGetFreeClientID).not.toHaveBeenCalled()
    })

    it('surfaces the original failure, not the refresh failure', async () => {
        mockSearch.mockRejectedValue(new Error('401 Unauthorized'))
        mockGetFreeClientID.mockRejectedValue(new Error('soundcloud.com down'))

        await expect(streamViaSoundCloud('song name', '3:30')).rejects.toThrow(
            '401 Unauthorized',
        )
        // One attempt only: the retry is skipped when recovery failed.
        expect(mockSearch).toHaveBeenCalledTimes(1)
    })

    it('propagates the retry failure when the refreshed id is still rejected', async () => {
        mockSearch.mockRejectedValue(new Error('401 Unauthorized'))

        await expect(streamViaSoundCloud('song name', '3:30')).rejects.toThrow(
            '401 Unauthorized',
        )
        expect(mockGetFreeClientID).toHaveBeenCalledTimes(1)
        expect(mockSearch).toHaveBeenCalledTimes(2)
    })

    it('scrapes a single id when concurrent calls fail together', async () => {
        mockSearch
            .mockRejectedValueOnce(new Error('401 Unauthorized'))
            .mockRejectedValueOnce(new Error('401 Unauthorized'))
            .mockResolvedValue([makeResult('Song Name', 210)])

        let releaseScrape: (id: string) => void = () => {}
        mockGetFreeClientID.mockReturnValue(
            new Promise<string>((resolve) => {
                releaseScrape = resolve
            }),
        )

        const both = Promise.all([
            streamViaSoundCloud('song name', '3:30'),
            streamViaSoundCloud('song name', '3:30'),
        ])
        await Promise.resolve()
        releaseScrape('fresh-client-id')

        await expect(both).resolves.toEqual([fakeReadable, fakeReadable])
        expect(mockGetFreeClientID).toHaveBeenCalledTimes(1)
    })

    it('does not scrape a second id for a failure right after a refresh', async () => {
        // A deleted track or a socket blip lands in the same catch as an expired
        // token. The first failure may scrape; the ones behind it must not.
        mockSearch
            .mockRejectedValueOnce(new Error('401 Unauthorized'))
            .mockResolvedValueOnce([makeResult('Song Name', 210)])
        await streamViaSoundCloud('song name', '3:30')
        expect(mockGetFreeClientID).toHaveBeenCalledTimes(1)

        mockSearch.mockRejectedValue(new Error('404 Not Found'))
        await expect(streamViaSoundCloud('gone track', '3:30')).rejects.toThrow(
            '404 Not Found',
        )
        // Still 1: the cooldown suppressed a second scrape, and the original
        // error surfaced untouched instead of paying for a pointless retry.
        expect(mockGetFreeClientID).toHaveBeenCalledTimes(1)
    })

    it('throttles the next scrape even when the refresh itself failed', async () => {
        // The case that matters most: soundcloud.com unreachable. If only a
        // successful refresh started the cooldown, every following track would
        // pay another full getFreeClientID timeout.
        mockGetFreeClientID.mockRejectedValue(new Error('soundcloud.com down'))
        mockSearch.mockRejectedValue(new Error('401 Unauthorized'))

        await expect(streamViaSoundCloud('song name', '3:30')).rejects.toThrow(
            '401 Unauthorized',
        )
        expect(mockGetFreeClientID).toHaveBeenCalledTimes(1)

        await expect(streamViaSoundCloud('other song', '3:30')).rejects.toThrow(
            '401 Unauthorized',
        )
        expect(mockGetFreeClientID).toHaveBeenCalledTimes(1)
    })

    it('does not refresh the client id when the call times out', async () => {
        jest.useFakeTimers()
        try {
            mockSearch.mockReturnValue(new Promise(() => {}))

            const pending = streamViaSoundCloud('song name', '3:30')
            const assertion = expect(pending).rejects.toThrow(
                'play-dl search timed out after 8000ms',
            )
            await jest.advanceTimersByTimeAsync(8_000)
            await assertion

            // Bounded by the single search budget: no scrape, no second attempt.
            expect(mockGetFreeClientID).not.toHaveBeenCalled()
            expect(mockSearch).toHaveBeenCalledTimes(1)
        } finally {
            jest.useRealTimers()
        }
    })
})
