import { jest } from '@jest/globals'
import type { Track } from 'discord-player'
import type { SpotifyAudioFeatures } from '../../../spotify/spotifyApi'
import {
    calculateRecommendationScore,
    enrichWithAudioFeatures,
    calculateGenreFamilyPenalty,
    getGenreFamilies,
    RECENCY_WINDOW_TRACKS,
} from './candidateScorer'
import { buildArtistFeedbackWeights, normalizeTrackKey } from './scoringUtils'
import type { SessionMood } from './sessionMood'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

const spotifyLinkServiceMock = jest.fn()
const getBatchAudioFeaturesMock = jest.fn()
const getArtistGenresMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    spotifyLinkService: {
        getValidAccessToken: (...args: unknown[]) =>
            spotifyLinkServiceMock(...args),
    },
}))

jest.mock('../../../spotify/spotifyApi', () => ({
    getBatchAudioFeatures: (...args: unknown[]) =>
        getBatchAudioFeaturesMock(...args),
    getArtistGenres: (...args: unknown[]) => getArtistGenresMock(...args),
}))

function createTrack(overrides: Partial<Track> = {}): Track {
    return {
        title: 'Test Song',
        author: 'Test Artist',
        durationMS: 3 * 60 * 1000,
        url: 'https://open.spotify.com/track/testid',
        source: 'spotify',
        ...overrides,
    } as Track
}

describe('candidateScorer', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        spotifyLinkServiceMock.mockResolvedValue(null)
        getBatchAudioFeaturesMock.mockResolvedValue(new Map())
        getArtistGenresMock.mockResolvedValue([])
    })

    describe('calculateRecommendationScore', () => {
        it.each([
            [
                'blocked artists',
                { author: 'Blocked Artist' },
                new Set(['blockedartist']),
            ],
            ['tracks > 15 minutes', { durationMS: 16 * 60 * 1000 }, new Set()],
            [
                'ambient/noise content',
                { title: 'Relaxing Rain Sounds for Sleep' },
                new Set(),
            ],
        ])('rejects %s with -Infinity score', (_, overrides, blockedKeys) => {
            const result = calculateRecommendationScore({
                candidate: createTrack(overrides),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                blockedArtistKeys: blockedKeys,
            })
            expect(result.score).toBe(-Infinity)
            expect(result.signals).toEqual([])
        })

        it('boosts preferred artists', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({ author: 'Favorite Artist' }),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                preferredArtistKeys: new Set(['favoriteartist']),
                likedWeights: new Map(),
            })
            expect(result.score).toBeGreaterThan(1)
            expect(result.signals).toContain('preferred artist')
        })

        it('rejects high-weight dislikes', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    title: 'Disliked Song',
                    author: 'Test Artist',
                }),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                autoplayMode: 'similar',
                dislikedWeights: new Map([['dislikedsong::testartist', 0.7]]),
            })
            expect(result.score).toBe(-Infinity)
        })

        it('applies same-artist novelty penalty', () => {
            const current = createTrack({ author: 'Test Artist' })
            const candidate = createTrack({
                title: 'Xyz Abc',
                author: 'Test Artist',
                source: 'youtube',
            })

            const result = calculateRecommendationScore({
                candidate: candidate,
                currentTrack: current,
                recentArtists: new Set(),
            })

            expect(result.score).toBeLessThan(1)
        })

        it('rejects Spanish candidates with no dominant locale', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({ title: 'Reggaeton Song' }),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                autoplayMode: 'similar',
                sessionMood: {
                    dominantLocale: null,
                    deepDiveArtist: null,
                    preferLong: false,
                    preferShort: false,
                    restless: false,
                },
            })
            expect(result.score).toBe(-Infinity)
        })

        it('rejects cross-genre with dominant family', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack(),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                autoplayMode: 'similar',
                sessionMood: null,
                genreContext: {
                    candidateTags: ['thrash metal', 'metal', 'rock'],
                    currentTrackTags: ['rap', 'hip hop', 'trap'],
                    sessionGenreFamilies: new Set(['rap_hiphop']),
                },
            })
            expect(result.score).toBe(-Infinity)
        })

        it.each([
            [
                'long tracks',
                { author: 'Test Artist', durationMS: 7 * 60 * 1000 },
                { preferLong: true },
                'long track match',
            ],
            [
                'short tracks',
                { author: 'Test Artist', durationMS: 2 * 60 * 1000 },
                { preferShort: true },
                'quick hit match',
            ],
        ])('boosts %s', (_, trackOverrides, moodOverride, signal) => {
            const baseMood = {
                dominantLocale: null,
                deepDiveArtist: null,
                preferLong: moodOverride.preferLong ?? false,
                preferShort: moodOverride.preferShort ?? false,
                restless: false,
            }
            const result = calculateRecommendationScore({
                candidate: createTrack(trackOverrides),
                currentTrack: createTrack({ durationMS: 5 * 60 * 1000 }),
                recentArtists: new Set(),
                autoplayMode: 'similar',
                sessionMood: baseMood,
            })
            expect(result.signals).toContain(signal)
        })

        it('does not reward cross-artist title-word overlap (name similarity removed)', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    title: 'Purple Rain Forever',
                    author: 'Different Artist',
                    source: 'youtube',
                }),
                currentTrack: createTrack({
                    title: 'Purple Rain',
                    author: 'Prince',
                }),
                recentArtists: new Set(),
            })
            expect(result.signals).not.toContain('similar title mood')
        })

        it('boosts popular mode based on liked weight', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    title: 'Hit Song',
                    author: 'Test Artist',
                }),
                currentTrack: createTrack(),
                recentArtists: new Set(['other artist']),
                autoplayMode: 'popular',
                likedWeights: new Map([['hitsong::testartist', 0.8]]),
            })
            expect(result.score).toBeGreaterThan(1)
        })

        describe('genre-conditional spotify-preferred boost (approach B)', () => {
            const session = new Set(['rnb_soul', 'rock_metal'])

            it('gives the full boost when the candidate overlaps the session family', () => {
                const result = calculateRecommendationScore({
                    candidate: createTrack({
                        author: 'In Genre',
                        source: 'spotify',
                    }),
                    currentTrack: createTrack({ author: 'Seed' }),
                    recentArtists: new Set(),
                    genreContext: {
                        candidateTags: ['soul'],
                        currentTrackTags: ['rock'],
                        sessionGenreFamilies: session,
                    },
                })
                expect(result.signals).toContain('spotify preferred')
            })

            it('drops the boost entirely for a known cross-family candidate (Drake on a Prince session)', () => {
                const withBoost = calculateRecommendationScore({
                    candidate: createTrack({
                        author: 'Drake',
                        source: 'spotify',
                    }),
                    currentTrack: createTrack({ author: 'Prince' }),
                    recentArtists: new Set(),
                    genreContext: {
                        candidateTags: ['hip hop'],
                        currentTrackTags: ['soul'],
                        sessionGenreFamilies: session,
                    },
                })
                expect(withBoost.signals).not.toContain('spotify preferred')
            })

            it('halves (not drops) the boost when the candidate genre is unknown', () => {
                const softSession = new Set(['rnb_soul', 'pop'])
                const onGenre = calculateRecommendationScore({
                    candidate: createTrack({
                        author: 'In Genre',
                        source: 'spotify',
                    }),
                    currentTrack: createTrack({ author: 'Seed' }),
                    recentArtists: new Set(),
                    genreContext: {
                        candidateTags: ['soul'],
                        currentTrackTags: ['soul'],
                        sessionGenreFamilies: softSession,
                    },
                })
                const unknown = calculateRecommendationScore({
                    candidate: createTrack({
                        author: 'Unknown Genre',
                        source: 'spotify',
                    }),
                    currentTrack: createTrack({ author: 'Seed' }),
                    recentArtists: new Set(),
                    genreContext: {
                        candidateTags: [],
                        currentTrackTags: ['soul'],
                        sessionGenreFamilies: softSession,
                    },
                })
                expect(unknown.signals).toContain('spotify preferred')
                expect(onGenre.score - unknown.score).toBeCloseTo(0.2, 5)
            })
        })

        it('fails closed on an untagged candidate in a strong-family session (approach B)', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    author: 'Untagged Mainstream',
                    source: 'youtube',
                }),
                currentTrack: createTrack({ author: 'Rapper' }),
                recentArtists: new Set(),
                genreContext: {
                    candidateTags: [],
                    currentTrackTags: ['hip hop'],
                    sessionGenreFamilies: new Set(['rap_hiphop']),
                },
            })
            expect(result.signals).toContain('genre family drift')
        })

        it('does not fail closed for untagged candidates on a non-strong session', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    author: 'Untagged',
                    source: 'youtube',
                }),
                currentTrack: createTrack({ author: 'Popstar' }),
                recentArtists: new Set(),
                genreContext: {
                    candidateTags: [],
                    currentTrackTags: ['pop'],
                    sessionGenreFamilies: new Set(['pop']),
                },
            })
            expect(result.signals).not.toContain('genre family drift')
        })

        describe('safe radius — seedDerived relaxation (2026-06-08 addendum)', () => {
            it('demotes (not rejects) a seed-derived cross-family candidate', () => {
                const result = calculateRecommendationScore({
                    candidate: createTrack({
                        author: 'Adjacent Genre',
                        source: 'youtube',
                    }),
                    currentTrack: createTrack({ author: 'Rapper' }),
                    recentArtists: new Set(),
                    seedDerived: true,
                    genreContext: {
                        candidateTags: ['soul'],
                        currentTrackTags: ['hip hop'],
                        sessionGenreFamilies: new Set(['rap_hiphop']),
                    },
                })
                expect(result.score).toBeGreaterThan(-Infinity)
                expect(result.signals).toContain('genre family drift')
            })

            it('still hard-rejects an UN-vetted cross-family candidate (drift guard intact)', () => {
                const result = calculateRecommendationScore({
                    candidate: createTrack({
                        author: 'Mainstream',
                        source: 'youtube',
                    }),
                    currentTrack: createTrack({ author: 'Rapper' }),
                    recentArtists: new Set(),
                    genreContext: {
                        candidateTags: ['soul'],
                        currentTrackTags: ['hip hop'],
                        sessionGenreFamilies: new Set(['rap_hiphop']),
                    },
                })
                expect(result.score).toBe(-Infinity)
            })

            it('applies only a mild penalty to a seed-derived UNTAGGED candidate in a strong session', () => {
                const seed = calculateRecommendationScore({
                    candidate: createTrack({
                        author: 'Untagged Related',
                        source: 'youtube',
                    }),
                    currentTrack: createTrack({ author: 'Rapper' }),
                    recentArtists: new Set(),
                    seedDerived: true,
                    genreContext: {
                        candidateTags: [],
                        currentTrackTags: ['hip hop'],
                        sessionGenreFamilies: new Set(['rap_hiphop']),
                    },
                })
                const unvetted = calculateRecommendationScore({
                    candidate: createTrack({
                        author: 'Untagged Mainstream',
                        source: 'youtube',
                    }),
                    currentTrack: createTrack({ author: 'Rapper' }),
                    recentArtists: new Set(),
                    genreContext: {
                        candidateTags: [],
                        currentTrackTags: ['hip hop'],
                        sessionGenreFamilies: new Set(['rap_hiphop']),
                    },
                })
                expect(seed.score - unvetted.score).toBeCloseTo(0.5, 5)
            })
        })
    })

    describe('calculateGenreFamilyPenalty', () => {
        it.each([
            [['rock'], [], -0.1],
            [['hip hop'], ['pop music'], -0.6],
        ])('returns correct penalty', (current, candidate, expected) => {
            expect(calculateGenreFamilyPenalty(current, candidate)).toBe(
                expected,
            )
        })
    })

    describe('getGenreFamilies', () => {
        it.each([
            [['hip hop', 'rap music'], 'rap_hiphop', true],
            [['unknown', 'fictional'], null, false],
        ])('identifies family in genres', (genres, family, shouldExist) => {
            const result = getGenreFamilies(genres)
            if (shouldExist) {
                expect(result.has(family)).toBe(true)
            } else {
                expect(result.size).toBe(0)
            }
        })
    })

    describe('replay frequency boost (acceptance criteria)', () => {
        it('applies replay-count boost to candidates matching frequently replayed track IDs', () => {
            const replayTrackId = 'frequently-played-track-id'
            const baselineResult = calculateRecommendationScore({
                candidate: createTrack({ id: replayTrackId }),
                currentTrack: createTrack(),
                recentArtists: new Set(),
            })
            const boostedResult = calculateRecommendationScore({
                candidate: createTrack({ id: replayTrackId }),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                replayFrequentTrackIds: new Set([replayTrackId]),
            })
            expect(boostedResult.score).toBeGreaterThan(baselineResult.score)
            expect(boostedResult.signals).toContain('replay frequent')
        })

        it('applies replay-count boost to candidates matching frequently replayed artist names', () => {
            const replayArtist = 'frequently-replayed-artist'
            const baselineResult = calculateRecommendationScore({
                candidate: createTrack({ author: replayArtist }),
                currentTrack: createTrack(),
                recentArtists: new Set(),
            })
            const boostedResult = calculateRecommendationScore({
                candidate: createTrack({ author: replayArtist }),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                replayFrequentArtists: new Set([replayArtist.toLowerCase()]),
            })
            expect(boostedResult.score).toBeGreaterThan(baselineResult.score)
            expect(boostedResult.signals).toContain('replay frequent')
        })

        it('bounds replay boost so it cannot flip genre-family veto (-Infinity)', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    author: 'Frequently Replayed Artist',
                }),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                replayFrequentArtists: new Set(['frequently replayed artist']),
                autoplayMode: 'similar',
                sessionMood: {
                    dominantLocale: null,
                    deepDiveArtist: null,
                    preferLong: false,
                    preferShort: false,
                    restless: false,
                },
                genreContext: {
                    candidateTags: ['thrash metal'],
                    currentTrackTags: ['reggaeton'],
                    sessionGenreFamilies: new Set(['latin']),
                },
            })
            expect(result.score).toBe(-Infinity)
        })

        it('bounds replay boost so it cannot flip blocked-artist rejection', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({ author: 'Blocked Artist' }),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                blockedArtistKeys: new Set(['blockedartist']),
                replayFrequentArtists: new Set(['blocked artist']),
            })
            expect(result.score).toBe(-Infinity)
        })

        it('bounds replay boost so it cannot flip dislike-weight rejection', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    title: 'Disliked Song',
                    author: 'Disliked Artist',
                }),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                autoplayMode: 'similar',
                dislikedWeights: new Map([
                    ['dislikedsong::dislikedartist', 0.8],
                ]),
                replayFrequentTrackIds: new Set(['frequently-played-track-id']),
            })
            expect(result.score).toBe(-Infinity)
        })

        it('applies replay boost additively below hard vetoes and respects diversity caps', () => {
            const candidate = createTrack({
                title: 'Great Song',
                author: 'Favorite Artist',
            })
            const baselineResult = calculateRecommendationScore({
                candidate,
                currentTrack: createTrack(),
                recentArtists: new Set(),
                preferredArtistKeys: new Set(['favoriteartist']),
            })
            const withReplayBoostResult = calculateRecommendationScore({
                candidate,
                currentTrack: createTrack(),
                recentArtists: new Set(),
                preferredArtistKeys: new Set(['favoriteartist']),
                replayFrequentArtists: new Set(['favorite artist']),
            })
            expect(withReplayBoostResult.score).toBeGreaterThan(
                baselineResult.score,
            )
            expect(withReplayBoostResult.signals).toContain('preferred artist')
            expect(withReplayBoostResult.signals).toContain('replay frequent')
        })

        it('gracefully handles missing replay frequency data (empty sets)', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack(),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                replayFrequentTrackIds: new Set(),
                replayFrequentArtists: new Set(),
            })
            expect(result.score).toBeDefined()
            expect(result.signals).toBeDefined()
            expect(() => result).not.toThrow()
        })

        it('emits implicit dislike signal when candidate is in implicit dislike keys', () => {
            const baselineResult = calculateRecommendationScore({
                candidate: createTrack({
                    title: 'Skipped Song',
                    author: 'Test Artist',
                }),
                currentTrack: createTrack(),
                recentArtists: new Set(),
            })
            const withDislikeResult = calculateRecommendationScore({
                candidate: createTrack({
                    title: 'Skipped Song',
                    author: 'Test Artist',
                }),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                implicitDislikeKeys: new Set(['skippedsong::testartist']),
            })
            expect(withDislikeResult.signals).toContain('implicit dislike')
            expect(withDislikeResult.score).toBeLessThan(baselineResult.score)
        })

        it('does not emit implicit dislike signal for the same-artist penalty', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    title: 'Similar Track',
                    author: 'Current Artist',
                }),
                currentTrack: createTrack({ author: 'Current Artist' }),
                recentArtists: new Set(),
                sessionMood: {
                    dominantLocale: null,
                    deepDiveArtist: null,
                    preferLong: false,
                    preferShort: false,
                    restless: false,
                },
            })
            expect(result.signals).not.toContain('implicit dislike')
        })

        it('does not emit implicit dislike for same artist during deep-dive', () => {
            const deepDiveArtist = 'Deep Dive Artist'
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    title: 'Similar Track',
                    author: deepDiveArtist,
                }),
                currentTrack: createTrack({ author: deepDiveArtist }),
                recentArtists: new Set(),
                sessionMood: {
                    dominantLocale: null,
                    deepDiveArtist: deepDiveArtist,
                    preferLong: false,
                    preferShort: false,
                    restless: false,
                },
            })
            expect(result.signals).not.toContain('implicit dislike')
        })

        it('does not emit implicit dislike when implicit dislike keys do not match', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({
                    title: 'Other Song',
                    author: 'Other Artist',
                }),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                implicitDislikeKeys: new Set(['skippedsong::testartist']),
            })
            expect(result.signals).not.toContain('implicit dislike')
        })
    })

    describe('unrequested remix penalty', () => {
        function score(title: string, author: string, seed: Track) {
            return calculateRecommendationScore({
                candidate: createTrack({ title, author }),
                currentTrack: seed,
                recentArtists: new Set(),
            })
        }

        // Prod 2026-10-15: autoplay queued these remixes over the originals.
        it.each([
            [
                createTrack({
                    title: 'Billie Jean',
                    author: 'Michael Jackson',
                }),
                ['Thriller', 'Michael Jackson'],
                [
                    'Thriller (Steve Aoki Midnight Hour Remix)',
                    'Michael Jackson, Steve Aoki',
                ],
            ],
            [
                createTrack({
                    title: "Baby's On Fire",
                    author: 'Die Antwoord',
                }),
                ['I Fink U Freeky', 'Die Antwoord'],
                [
                    "I FINK YOU FREEKY - GOD'S DEATH TRAP REMIX",
                    'Die Antwoord, G.O.D.',
                ],
            ],
            [
                createTrack({ title: 'Luxury', author: 'Azealia Banks' }),
                ['Liquorice', 'Azealia Banks'],
                ['luxury - sped up + reverb', 'pearl, fast forward >>'],
            ],
        ])('ranks the original above its remix', (seed, original, remix) => {
            const orig = score(original[0], original[1], seed)
            const mix = score(remix[0], remix[1], seed)
            expect(orig.score).toBeGreaterThan(mix.score)
            expect(mix.signals).toContain('unrequested remix')
            expect(orig.signals).not.toContain('unrequested remix')
        })

        it('keeps remixes when the seed itself is a remix', () => {
            const seed = createTrack({
                title: 'Bad Girls - Switch Remix',
                author: 'M.I.A.',
            })
            const result = score('Bad (feat. Rihanna) - Remix', 'Wale', seed)
            expect(result.signals).not.toContain('unrequested remix')
        })

        it('does not treat official edits or remasters as remixes', () => {
            const seed = createTrack({ title: 'Beat It' })
            for (const title of [
                'Purple Rain - 7" Single Edit; 2017 Remaster',
                'Take on Me - 1985 Single Mix; 2015 Remaster',
            ]) {
                expect(score(title, 'Prince', seed).signals).not.toContain(
                    'unrequested remix',
                )
            }
        })

        it.each([
            'Song - Sped-Up',
            'Song (Club-Mix)',
            'Song - Reverb',
            'Song (The Remixes)',
            'Song - Re-Mix',
        ])('penalizes hyphenated and reverb markers: %s', (title) => {
            const seed = createTrack({ title: 'Beat It' })
            expect(score(title, 'Other', seed).signals).toContain(
                'unrequested remix',
            )
        })

        it('ignores marker words that are the song name itself', () => {
            const seed = createTrack({ title: 'Remix' })
            expect(score('Speed Up', 'Other', seed).signals).not.toContain(
                'unrequested remix',
            )
            expect(score('Thriller (Remix)', 'Other', seed).signals).toContain(
                'unrequested remix',
            )
        })
    })

    describe('artist-level feedback', () => {
        // Owner report 2026-10-15: thumbs up/down never showed in later
        // autoplay picks. The voted song sits in the last-150 history
        // exclusion, so its exact-key weight never meets a candidate.
        const seed = createTrack({ title: 'Take On Me', author: 'a-ha' })
        const sameArtist = createTrack({
            title: 'Beat It',
            author: 'Michael Jackson',
        })
        const unrelated = createTrack({ title: 'Africa', author: 'Toto' })
        const votes = (...titles: string[]) =>
            new Map(
                titles.map((t) => [normalizeTrackKey(t, 'Michael Jackson'), 1]),
            )
        const score = (
            candidate: Track,
            feedback: {
                likedWeights?: Map<string, number>
                dislikedWeights?: Map<string, number>
            },
        ) =>
            calculateRecommendationScore({
                candidate,
                currentTrack: seed,
                recentArtists: new Set(),
                ...feedback,
                likedArtistWeights: buildArtistFeedbackWeights(
                    feedback.likedWeights ?? new Map(),
                ),
                dislikedArtistWeights: buildArtistFeedbackWeights(
                    feedback.dislikedWeights ?? new Map(),
                ),
            })

        it('a like on one song lifts the same artist over an equal unrelated candidate', () => {
            const likedWeights = votes('Billie Jean')
            const liked = score(sameArtist, { likedWeights })
            const other = score(unrelated, { likedWeights })
            expect(liked.score).toBeGreaterThan(other.score)
            expect(liked.signals).toContain('liked artist track')
            expect(other.signals).not.toContain('liked artist track')
        })

        it('matches a co-credited candidate on the voted primary artist', () => {
            const result = score(
                createTrack({
                    title: 'Thriller',
                    author: 'Michael Jackson, Steve Aoki',
                }),
                { likedWeights: votes('Billie Jean') },
            )
            expect(result.signals).toContain('liked artist track')
        })

        it('caps the liked-artist boost', () => {
            const base = score(sameArtist, {})
            const many = score(sameArtist, {
                likedWeights: votes(
                    'Billie Jean',
                    'Thriller',
                    'Bad',
                    'Smooth Criminal',
                ),
            })
            expect(many.score - base.score).toBeCloseTo(0.4)
        })

        it('a dislike on one song demotes the same artist below an equal unrelated candidate', () => {
            const dislikedWeights = votes('Billie Jean')
            const disliked = score(sameArtist, { dislikedWeights })
            const other = score(unrelated, { dislikedWeights })
            expect(disliked.score).toBeLessThan(other.score)
            expect(disliked.score).toBeGreaterThan(-Infinity)
            expect(disliked.signals).toContain('disliked artist')
        })

        it('two disliked songs of an artist weigh more than one', () => {
            const one = score(sameArtist, {
                dislikedWeights: votes('Billie Jean'),
            })
            const two = score(sameArtist, {
                dislikedWeights: votes('Billie Jean', 'Thriller'),
            })
            expect(two.score).toBeLessThan(one.score)
            expect(two.score).toBeGreaterThan(-Infinity)
        })

        it('buildArtistFeedbackWeights sums per primary artist and caps at 2', () => {
            const weights = buildArtistFeedbackWeights(
                new Map([
                    [normalizeTrackKey('Billie Jean', 'Michael Jackson'), 0.9],
                    [
                        normalizeTrackKey('Bad', 'Michael Jackson, Steve Aoki'),
                        0.4,
                    ],
                    [normalizeTrackKey('Thriller', 'Michael Jackson'), 1],
                    [normalizeTrackKey('Africa', 'Toto'), 0.15],
                    ['', 1],
                ]),
            )
            expect(weights.get('michaeljackson')).toBe(2)
            expect(weights.get('toto')).toBe(0.15)
            expect(weights.size).toBe(2)
        })
    })

    describe('recency-decay penalty (diversity decay)', () => {
        const candidateArtist = 'Recent Band'
        const candidateKey = candidateArtist.toLowerCase()

        function score(recentArtistIndices?: Map<string, number>) {
            return calculateRecommendationScore({
                candidate: createTrack({ author: candidateArtist }),
                currentTrack: createTrack({ author: 'Now Playing Artist' }),
                recentArtists: new Set(),
                recentArtistIndices,
            })
        }

        it('penalizes a candidate whose artist played most recently (index 0)', () => {
            const baseline = score()
            const decayed = score(new Map([[candidateKey, 0]]))
            expect(decayed.score).toBeLessThan(baseline.score)
            expect(decayed.signals).toContain('recency decay')
        })

        it('applies a smaller penalty the further back the artist appeared', () => {
            const recent = score(new Map([[candidateKey, 0]]))
            const older = score(new Map([[candidateKey, 8]]))
            expect(older.score).toBeGreaterThan(recent.score)
            expect(older.signals).toContain('recency decay')
        })

        it('applies no penalty once the artist is at or beyond the decay window', () => {
            const baseline = score()
            const atWindow = score(
                new Map([[candidateKey, RECENCY_WINDOW_TRACKS]]),
            )
            expect(atWindow.score).toBe(baseline.score)
            expect(atWindow.signals).not.toContain('recency decay')
        })

        it('applies no penalty when the candidate artist is not in the recent map', () => {
            const result = score(new Map([['some other artist', 0]]))
            expect(result.signals).not.toContain('recency decay')
        })

        it('omits the penalty entirely when no recency map is provided', () => {
            const result = score()
            expect(result.signals).not.toContain('recency decay')
        })

        it('is bounded so it cannot flip a genre-family veto (-Infinity)', () => {
            const result = calculateRecommendationScore({
                candidate: createTrack({ author: candidateArtist }),
                currentTrack: createTrack({ author: 'Now Playing Artist' }),
                recentArtists: new Set(),
                recentArtistIndices: new Map([[candidateKey, 0]]),
                autoplayMode: 'similar',
                sessionMood: {
                    dominantLocale: null,
                    deepDiveArtist: null,
                    preferLong: false,
                    preferShort: false,
                    restless: false,
                },
                genreContext: {
                    candidateTags: ['thrash metal'],
                    currentTrackTags: ['reggaeton'],
                    sessionGenreFamilies: new Set(['latin']),
                },
            })
            expect(result.score).toBe(-Infinity)
        })
    })
})
