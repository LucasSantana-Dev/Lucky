import type { Track } from 'discord-player'
import type { SpotifyAudioFeatures } from '../../../spotify/spotifyApi'
import { getBatchAudioFeatures } from '../../../spotify/spotifyApi'
import { spotifyLinkService } from '@lucky/shared/services'
import type { SessionMood } from './sessionMood'
import type { RecommendationSignal } from './recommendationBasis.js'
import { cleanAuthor } from '../searchQueryCleaner'
import { detectSpanishMarkers } from '../languageHeuristics'
import { normalizeText, normalizeTrackKey } from './scoringUtils'
import type { ScoredTrack } from './diversitySelector'

const SCORE_SAME_ARTIST = 0.3
const SCORE_POPULAR_ARTIST = 0.2
const SCORE_PREFERRED_ARTIST = 0.3
const SCORE_LIKED_WEIGHT_MULTIPLIER = 0.3
const SCORE_DISLIKED_PENALTY = -0.3
const SCORE_IMPLICIT_DISLIKE = -0.35
const SCORE_IMPLICIT_LIKE = 0.25
const SCORE_TITLE_SIM_BONUS = 0.12
const TITLE_SIM_THRESHOLD = 0.4
const SCORE_RECENT_ARTIST = -0.25
const SCORE_DURATION_MATCH = 0.15
const SCORE_DURATION_BONUS_THRESHOLD = 0.05
const SCORE_ACOUSTICNESS_MATCH = 0.1
const SCORE_BLOCKED_ARTIST = -0.4
const SCORE_FREQUENT_ARTIST = -0.2
const SCORE_GENRE_TAG_MAX = 0.2
const SCORE_GENRE_TAG_PER_MATCH = 0.05
const SCORE_LIKED_ARTIST_WEIGHT = 0.2
const SCORE_LIKED_ARTIST_TEMPO = 0.1
const SCORE_TEMPO_PENALTY_LARGE = -0.15
const SCORE_TEMPO_PENALTY_SMALL = -0.07
const TEMPO_DELTA_SMALL = 25
const DURATION_RATIO_TIGHT_LOW = 0.8
const DURATION_RATIO_TIGHT_HIGH = 1.2
const DURATION_RATIO_LOOSE_LOW = 0.7
const DURATION_RATIO_LOOSE_HIGH = 1.3
const SCORE_DURATION_RATIO_TIGHT = 0.15
const SCORE_DURATION_RATIO_LOOSE = 0.05
const GENRE_PENALTY_STRONG = -0.6
const GENRE_PENALTY_WEAK = -0.3
const GENRE_PENALTY_UNKNOWN = -0.1
const SCORE_SPOTIFY_PREFERRED = 0.4
// On an unknown-genre candidate the spotify-preferred boost is halved rather
// than dropped, so the pool isn't starved when tags are missing.
const SPOTIFY_PREFERRED_UNKNOWN_MULTIPLIER = 0.5
// Replay-count boost: applied additively when a candidate matches a track or
// artist replayed >2 times in the last 30 days. Bounded so it cannot flip
// genre vetoes (-Infinity) or dominate provenance-aware rankings.
const SCORE_REPLAY_COUNT_BOOST = 0.15
// Recency-decay penalty: applied to candidates whose artist appeared in the
// recent queue, scaled by how recently they appeared. Decays linearly to zero
// over a window of RECENCY_WINDOW_TRACKS. Bounded so it cannot flip genre
// vetoes (-Infinity) or override provenance-aware ordering.
const SCORE_RECENCY_DECAY_MAX = -0.15
export const RECENCY_WINDOW_TRACKS = 10
// Genre families dense/cohesive enough that a cross-family jump reads as drift.
// Used both for the cross-family penalty and the untagged-candidate fail-closed
// guard. Kept deliberately narrow (pop/soul are too broad to fail closed on).
const STRONG_GENRE_FAMILIES = ['rap_hiphop', 'rock_metal', 'latin']
const DISLIKE_WEIGHT_THRESHOLD = 0.5

/**
 * Tag-driven genre context, threaded through every collector by the
 * replenisher. Lets the in-pass scorer apply genre-family penalties without
 * waiting for the post-selection `enrichWithAudioFeatures` pass — and so
 * keeps working when a Spotify token is unavailable or the deprecated
 * audio-features endpoint stops responding.
 */
export interface GenreContext {
    /** Last.fm tags for the candidate's artist (lowercased). */
    candidateTags?: string[]
    /** Last.fm tags for the current/seed track's artist. */
    currentTrackTags?: string[]
    /**
     * Genre families dominant in the recent session history. When non-empty,
     * a candidate whose genre families intersect zero with this set is
     * hard-rejected as cross-genre drift.
     */
    sessionGenreFamilies?: Set<string>
}

const GENRE_FAMILIES = {
    rap_hiphop: ['hip hop', 'rap', 'trap', 'drill', 'gangster rap', 'g-funk'],
    rnb_soul: ['r&b', 'soul', 'neo soul'],
    electronic: [
        'edm',
        'house',
        'techno',
        'trance',
        'dubstep',
        'drum and bass',
        'electro',
        'synthwave',
    ],
    rock_metal: ['rock', 'metal', 'punk', 'grunge', 'alternative'],
    pop: ['pop', 'dance pop', 'latin pop', 'k-pop', 'indie pop'],
    latin: [
        'reggaeton',
        'forró',
        'samba',
        'bossa nova',
        'latin trap',
        'trap latino',
    ],
    country_folk: ['country', 'folk', 'bluegrass'],
    jazz_classical: ['jazz', 'classical', 'orchestral'],
    world: ['afrobeat', 'desi', 'bhangra'],
    ambient_chill: ['lofi', 'chillwave', 'downtempo', 'ambient'],
    gospel_christian: [
        'gospel',
        'christian',
        'christian music',
        'contemporary christian music',
        'ccm',
        'worship',
        'christian rock',
        'christian pop',
        'praise & worship',
        'religious',
    ],
}

const AMBIENT_NOISE_RE =
    /\b(?:rain sounds?|rain for sleep|ocean waves?|waves? sounds?|nature sounds?|forest sounds?|thunder sounds?|white noise|brown noise|pink noise|asmr|sleep sounds?|sleep music|relaxing rain|ambient sounds?|binaural beats?|solfeggio|healing frequ|528 ?hz|432 ?hz|963 ?hz|chakra healing|spa music|massage music|yoga music|deep sleep|baby sleep|guided meditation|meditation music)\b/i // NOSONAR S5852 — trusted track title from internal API, not user input

const EDM_MIX_RE =
    /\b(?:dj set|festival set|\d+ ?(?:hour|hr) mix|extended mix|club mix|nightclub mix|edm mix|trance mix)\b/i // NOSONAR S5852 — trusted track title from internal API, not user input

export function getGenreFamilies(genres: string[]): Set<string> {
    const families = new Set<string>()
    const lowerGenres = genres.map((g) => g.toLowerCase())

    for (const [family, keywords] of Object.entries(GENRE_FAMILIES)) {
        for (const keyword of keywords) {
            if (lowerGenres.some((g) => g.includes(keyword))) {
                families.add(family)
                break
            }
        }
    }

    return families
}

export function calculateGenreFamilyPenalty(
    currentGenres: string[],
    candidateGenres: string[],
): number {
    const currentFamilies = getGenreFamilies(currentGenres)
    const candidateFamilies = getGenreFamilies(candidateGenres)

    if (currentFamilies.size === 0 || candidateFamilies.size === 0) {
        return GENRE_PENALTY_UNKNOWN
    }

    for (const family of currentFamilies) {
        if (candidateFamilies.has(family)) {
            return 0
        }
    }

    const isStrongGenre = Array.from(currentFamilies).some((f) =>
        STRONG_GENRE_FAMILIES.includes(f),
    )

    return isStrongGenre ? GENRE_PENALTY_STRONG : GENRE_PENALTY_WEAK
}

export interface ScoringContext {
    // Required properties
    candidate: Track
    currentTrack: Track
    recentArtists: Set<string>
    // Optional properties with defaults
    likedWeights?: Map<string, number>
    preferredArtistKeys?: Set<string>
    blockedArtistKeys?: Set<string>
    autoplayMode?: 'similar' | 'discover' | 'popular'
    artistFrequency?: Map<string, number>
    implicitDislikeKeys?: Set<string>
    implicitLikeKeys?: Set<string>
    dislikedWeights?: Map<string, number>
    sessionMood?: SessionMood | null
    skipNoveltyBoost?: boolean
    /**
     * True when the candidate came from a Last.fm-similarity-vetted source
     * (seed-similar / lastfm-similar / lastfm-loved) — i.e. inside the "safe
     * radius" around the seed. Such candidates get RELAXED genre guards: the
     * cross-family veto becomes a demotion (adjacent families allowed) and the
     * untagged fail-closed becomes a mild penalty. Un-vetted sources (broad
     * fallback, genre-tag, generic search) keep the strict guards that block
     * mainstream drift. See ADR 2026-06-07 addendum 2026-06-08.
     */
    seedDerived?: boolean
    genreContext?: {
        candidateTags?: string[]
        currentTrackTags?: string[]
        sessionGenreFamilies?: Set<string>
    }
    /**
     * Sets of track IDs and artist names that the user has replayed >2 times in
     * the last 30 days, used to apply a bounded boost to replay-frequent candidates.
     */
    replayFrequentTrackIds?: Set<string>
    replayFrequentArtists?: Set<string>
    /**
     * Map of artist names (lowercased) to their queue position (0 = most recent)
     * in the recent history. Used to calculate recency-decay penalty: artists
     * that appeared recently get a penalty that decays to zero over RECENCY_WINDOW_TRACKS.
     */
    recentArtistIndices?: Map<string, number>
}

export function calculateRecommendationScore(ctx: ScoringContext): {
    score: number
    signals: RecommendationSignal[]
} {
    const {
        candidate,
        currentTrack,
        recentArtists,
        likedWeights = new Map<string, number>(),
        preferredArtistKeys = new Set(),
        blockedArtistKeys = new Set(),
        autoplayMode = 'similar',
        artistFrequency = new Map<string, number>(),
        implicitDislikeKeys = new Set(),
        implicitLikeKeys = new Set(),
        dislikedWeights = new Map<string, number>(),
        sessionMood = null,
        skipNoveltyBoost = false,
        seedDerived = false,
        genreContext = {},
        replayFrequentTrackIds = new Set(),
        replayFrequentArtists = new Set(),
        recentArtistIndices = new Map<string, number>(),
    } = ctx
    const candidateTags = genreContext.candidateTags ?? []
    const currentTrackTags = genreContext.currentTrackTags ?? []
    const sessionGenreFamilies =
        genreContext.sessionGenreFamilies ?? new Set<string>()
    // Reference families for the session: prefer the history-derived session
    // families (present even when the current track is untagged), else fall
    // back to the current track's own tags. Drives both the genre-conditional
    // spotify boost and the untagged fail-closed guard below.
    const referenceFamilies =
        sessionGenreFamilies.size > 0
            ? sessionGenreFamilies
            : getGenreFamilies(currentTrackTags)
    const sessionHasStrongFamily = Array.from(referenceFamilies).some((f) =>
        STRONG_GENRE_FAMILIES.includes(f),
    )
    const currentArtist = currentTrack.author.toLowerCase()
    const candidateArtist = candidate.author.toLowerCase()
    const candidateArtistKey = normalizeText(cleanAuthor(candidate.author))

    if (blockedArtistKeys.has(candidateArtistKey)) {
        return { score: -Infinity, signals: [] }
    }

    const MAX_CANDIDATE_DURATION_MS = 15 * 60 * 1000
    if (
        candidate.durationMS &&
        candidate.durationMS > MAX_CANDIDATE_DURATION_MS
    ) {
        return { score: -Infinity, signals: [] }
    }

    const candidateTitle = candidate.title ?? ''
    if (AMBIENT_NOISE_RE.test(candidateTitle)) {
        return { score: -Infinity, signals: [] }
    }
    if (EDM_MIX_RE.test(candidateTitle)) {
        return { score: -Infinity, signals: [] }
    }

    let score = 1
    const signals: RecommendationSignal[] = []

    // Cross-locale veto: if the session has shown no Spanish content but the
    // candidate looks Spanish (Spanish-distinct accents/stopwords/gospel
    // markers in title/author, OR Spanish/Latin tags from Last.fm), reject
    // outright. The previous soft −0.45 still let a Spanish gospel track
    // through on a Brazilian rap session because of stacked
    // "completed before / similar duration / spotify preferred" boosts.
    if (sessionMood !== null && sessionMood.dominantLocale === null) {
        const candidateText = `${candidateTitle} ${candidate.author ?? ''}`
        if (detectSpanishMarkers(candidateText, candidateTags)) {
            return { score: -Infinity, signals: [] }
        }
    }

    // Cross-genre-family veto: if the session has settled into one or more
    // dominant genre families (rap_hiphop, rock_metal, latin, …) and the
    // candidate's Last.fm tags don't intersect any of them, reject.
    // Mirrors the cross-locale veto above and replaces the post-selection
    // `enrichWithAudioFeatures` pass that depended on Spotify's deprecated
    // audio-features endpoint.
    // Skip the hard veto during skip storms so the candidate pool broadens.
    const inSkipStorm = (sessionMood?.recentSkipCount ?? 0) >= 3
    if (
        !inSkipStorm &&
        sessionGenreFamilies.size > 0 &&
        candidateTags.length > 0
    ) {
        const candidateFamilies = getGenreFamilies(candidateTags)
        if (candidateFamilies.size > 0) {
            let intersects = false
            for (const family of candidateFamilies) {
                if (sessionGenreFamilies.has(family)) {
                    intersects = true
                    break
                }
            }
            if (!intersects) {
                // Un-vetted cross-family candidate → hard reject (drift guard).
                // Seed-derived (Last.fm-similarity-vetted) candidate → it's
                // inside the safe radius, so allow an adjacent family but demote
                // it rather than reject, keeping the seed neighborhood explorable.
                if (seedDerived) {
                    score += GENRE_PENALTY_WEAK
                    signals.push('genre family drift')
                } else {
                    return { score: -Infinity, signals: [] }
                }
            }
        }
    }

    // Fail-closed for strong-family sessions when the candidate is UNTAGGED.
    // The tagged cross-genre veto above can't judge a candidate with no Last.fm
    // tags, so on a rap/rock/latin session an unknown mainstream track would
    // otherwise slip through (fail-open — the core of the Prince→Drake drift).
    // Treat untagged candidates as assumed cross-genre and demote them, but
    // keep them in the pool (penalty, not hard reject) so the queue never
    // stalls; relaxed during skip storms so the pool can broaden.
    if (!inSkipStorm && candidateTags.length === 0 && sessionHasStrongFamily) {
        // Seed-derived untagged candidates are vetted-related to the seed, so a
        // mild penalty (don't assume cross-genre); un-vetted untagged candidates
        // keep the strong fail-closed penalty that blocks mainstream drift.
        score += seedDerived ? GENRE_PENALTY_UNKNOWN : GENRE_PENALTY_STRONG
        signals.push('genre family drift')
    }

    if (preferredArtistKeys.has(candidateArtistKey)) {
        score += SCORE_PREFERRED_ARTIST
        signals.push('preferred artist')
    }

    const freq = artistFrequency.get(candidateArtistKey) ?? 0
    if (freq >= 5) {
        score += SCORE_SAME_ARTIST
        signals.push('favourite artist')
    } else if (freq >= 3) {
        score += SCORE_POPULAR_ARTIST
        signals.push('liked artist')
    } else if (freq >= 1) {
        score += SCORE_POPULAR_ARTIST / 2
        signals.push('known artist')
    }

    const candidateKey = normalizeTrackKey(candidate.title, candidate.author)
    const likedWeight = likedWeights.get(candidateKey)
    if (likedWeight !== undefined) {
        score += SCORE_LIKED_WEIGHT_MULTIPLIER * likedWeight
        signals.push('liked track')
    }

    const dislikedWeight = dislikedWeights.get(candidateKey)
    if (dislikedWeight !== undefined) {
        if (dislikedWeight > DISLIKE_WEIGHT_THRESHOLD) {
            return { score: -Infinity, signals: [] }
        }
        score -= Math.abs(SCORE_DISLIKED_PENALTY) * dislikedWeight
        signals.push('old dislike')
    }

    if (implicitDislikeKeys.has(candidateKey)) {
        score += SCORE_IMPLICIT_DISLIKE
        signals.push('implicit dislike')
    }
    if (implicitLikeKeys.has(candidateKey)) {
        score += SCORE_IMPLICIT_LIKE
        signals.push('completed before')
    }

    const deepDiveArtist = sessionMood?.deepDiveArtist
        ? cleanAuthor(sessionMood.deepDiveArtist).toLowerCase()
        : null
    const isDeepDive =
        deepDiveArtist !== null && candidateArtist === deepDiveArtist
    if (candidateArtist === currentArtist) {
        if (!isDeepDive) {
            // Same-artist penalty reuses the implicit-dislike weight but is a
            // distinct heuristic — do NOT emit the 'implicit dislike' signal
            // here or Phase D telemetry would conflate the two.
            score += SCORE_IMPLICIT_DISLIKE
        }
        const titleSim = sharedTitleTokenScore(
            candidate.title ?? '',
            currentTrack.title ?? '',
        )
        if (titleSim > TITLE_SIM_THRESHOLD) {
            score += SCORE_TITLE_SIM_BONUS
            signals.push('album match')
        }
        if (isDeepDive) {
            score += SCORE_TITLE_SIM_BONUS
            signals.push('deep-dive artist')
        }
    } else if (
        !skipNoveltyBoost &&
        !recentArtists.has(candidateArtist) &&
        !isDeepDive
    ) {
        score += SCORE_DURATION_MATCH
        signals.push('session novelty')
    }
    if (
        candidate.source === currentTrack.source &&
        candidate.source !== 'spotify'
    ) {
        score += SCORE_RECENT_ARTIST
    } else if (candidate.source && candidate.source !== currentTrack.source) {
        signals.push('source variety')
    }
    // NOTE: the cross-artist title-token bonus ("similar title mood") was
    // removed — rewarding shared title words across different artists is name
    // similarity, not musical similarity, and it pulled in near-identically
    // named tracks (often variants of the same song → duplicate-ish entries).
    // Same-artist album coherence is still captured by the 'album match' signal
    // above; musical similarity comes from Last.fm match + genre families.
    if (
        currentTrack.durationMS &&
        candidate.durationMS &&
        currentTrack.durationMS > 0
    ) {
        const ratio = candidate.durationMS / currentTrack.durationMS
        if (
            ratio >= DURATION_RATIO_TIGHT_LOW &&
            ratio <= DURATION_RATIO_TIGHT_HIGH
        ) {
            score += SCORE_DURATION_RATIO_TIGHT
            signals.push('similar energy')
        } else if (
            ratio >= DURATION_RATIO_LOOSE_LOW &&
            ratio <= DURATION_RATIO_LOOSE_HIGH
        ) {
            score += SCORE_DURATION_RATIO_LOOSE
        }
    }

    if (candidate.durationMS && candidate.durationMS > 7 * 60 * 1000) {
        score += SCORE_FREQUENT_ARTIST
        signals.push('long track penalty')
    }

    if (sessionMood) {
        const durationMs = candidate.durationMS ?? 0
        if (
            sessionMood.deepDiveArtist &&
            candidateArtist === sessionMood.deepDiveArtist
        ) {
            score += SCORE_DURATION_MATCH
            signals.push('deep dive')
        }
        if (sessionMood.preferLong && durationMs > 0) {
            const durationBonus =
                0.15 * Math.tanh((durationMs - 300_000) / 60_000)
            score += durationBonus
            if (durationBonus > SCORE_DURATION_BONUS_THRESHOLD)
                signals.push('long track match')
        }
        if (sessionMood.preferShort && durationMs > 0 && durationMs < 180_000) {
            score += SCORE_ACOUSTICNESS_MATCH
            signals.push('quick hit match')
        }
        if (sessionMood.restless) {
            if (!recentArtists.has(candidateArtist)) {
                score += SCORE_ACOUSTICNESS_MATCH
                signals.push('restless discovery')
            }
        }
    }

    if (candidate.source === 'spotify') {
        // Genre-condition the spotify-preferred boost — the single largest,
        // previously genre-blind term that let mainstream Spotify tracks (e.g.
        // Drake on a Prince session) outrank seed-similar candidates. Full
        // boost only when the candidate overlaps the session's families; half
        // when its genre is unknown (don't starve the pool); none on a known
        // cross-family candidate.
        const candidateFamilies =
            candidateTags.length > 0
                ? getGenreFamilies(candidateTags)
                : new Set<string>()
        let spotifyBoost: number
        if (referenceFamilies.size === 0 || candidateFamilies.size === 0) {
            spotifyBoost =
                SCORE_SPOTIFY_PREFERRED * SPOTIFY_PREFERRED_UNKNOWN_MULTIPLIER
        } else {
            let overlaps = false
            for (const family of candidateFamilies) {
                if (referenceFamilies.has(family)) {
                    overlaps = true
                    break
                }
            }
            spotifyBoost = overlaps ? SCORE_SPOTIFY_PREFERRED : 0
        }
        if (spotifyBoost > 0) {
            score += spotifyBoost
            signals.push('spotify preferred')
        }
    }

    // Replay-count boost: match the candidate's track ID or artist against
    // tracks/artists replayed >2 times in the last 30 days. Bounded boost
    // applied additively, stacks below hard vetoes (blocked, cross-locale,
    // cross-genre on un-vetted sources) and respects provenance-aware guards.
    if (
        replayFrequentTrackIds.has(candidate.id) ||
        replayFrequentArtists.has(candidateArtist)
    ) {
        score += SCORE_REPLAY_COUNT_BOOST
        signals.push('replay frequent')
    }

    // Recency-decay penalty: candidates whose artist appeared in the recent
    // queue receive a penalty that decays linearly to zero over a window of
    // RECENCY_WINDOW_TRACKS. More recent = larger penalty, older = smaller
    // penalty. Bounded and applied additively so it cannot flip hard vetoes
    // or override provenance-aware ordering.
    const recentIndex = recentArtistIndices.get(candidateArtist)
    if (recentIndex !== undefined && recentIndex >= 0) {
        // Linear decay: penalty = max * (1 - index/window), clamped to [0, max]
        const decayFactor = Math.max(0, 1 - recentIndex / RECENCY_WINDOW_TRACKS)
        const penalty = SCORE_RECENCY_DECAY_MAX * decayFactor
        if (penalty !== 0) {
            score += penalty
            signals.push('recency decay')
        }
    }

    // Soft genre-family penalty (formerly inside enrichWithAudioFeatures via
    // Spotify's getArtistGenres). When both sides have Last.fm tags, score
    // family overlap: same family → 0, no families known → −0.1, no overlap
    // and current is in a strong family → −0.6, no overlap otherwise → −0.3.
    // This runs in-pass so it works without a Spotify token, and stacks
    // gracefully when the cross-genre veto above didn't fire (mixed sessions
    // or candidates whose tags don't map to a known family).
    if (currentTrackTags.length > 0 && candidateTags.length > 0) {
        let familyPenalty = calculateGenreFamilyPenalty(
            currentTrackTags,
            candidateTags,
        )
        if (inSkipStorm) {
            familyPenalty *= 0.5
        }
        if (familyPenalty !== 0) {
            score += familyPenalty
            if (familyPenalty <= -0.3) {
                signals.push('genre family drift')
            }
        }
    }

    if (
        /\b(?:acoustic|live|ao\s{0,3}vivo|ac[uú]stico|cover|karaoke|instrumental)\b/i.test(
            candidate.title ?? '',
        )
    ) {
        score += SCORE_FREQUENT_ARTIST
        signals.push('version variant')
    }

    if (
        /\b(?:legendad[ao]|traduzido|tradução|legendas?)\b/i.test(
            candidate.title ?? '',
        ) ||
        /\(tributo[^)]*\)/i.test(candidate.title ?? '') ||
        /\(\d{1,2}:\d{2}:\d{2}\)/.test(candidate.title ?? '')
    ) {
        score += SCORE_BLOCKED_ARTIST
        signals.push('low quality upload')
    }

    if (autoplayMode === 'discover') {
        if (!recentArtists.has(candidateArtist)) {
            score += SCORE_IMPLICIT_LIKE
            signals.push('discovery boost')
        }
        if (recentArtists.has(candidateArtist)) {
            score += SCORE_FREQUENT_ARTIST
        }
    } else if (autoplayMode === 'popular') {
        if (likedWeight !== undefined) {
            score += SCORE_LIKED_ARTIST_WEIGHT * likedWeight
        }
        if (candidate.durationMS && currentTrack.durationMS) {
            const ratio = candidate.durationMS / currentTrack.durationMS
            if (ratio >= 0.9 && ratio <= 1.1) {
                score += SCORE_LIKED_ARTIST_TEMPO
                signals.push('energy match')
            }
        }
    }

    return {
        score,
        signals,
    }
}

function sharedTitleTokenScore(titleA: string, titleB: string): number {
    const tokensA = new Set(splitTokens(titleA))
    const tokensB = splitTokens(titleB)
    if (tokensA.size === 0 || tokensB.length === 0) return 0

    let matches = 0
    for (const token of tokensB) {
        if (tokensA.has(token)) matches++
    }

    return Math.min(SCORE_GENRE_TAG_MAX, matches * SCORE_GENRE_TAG_PER_MATCH)
}

function splitTokens(value: string): string[] {
    return value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 2)
}

export async function enrichWithAudioFeatures(
    tracks: ScoredTrack[],
    userId: string,
    currentFeatures: SpotifyAudioFeatures | null,
    currentArtistName?: string,
): Promise<ScoredTrack[]> {
    if (!currentFeatures || !userId) return tracks

    const token = await Promise.resolve(
        spotifyLinkService.getValidAccessToken(userId),
    ).catch(() => null)
    if (!token) return tracks

    const spotifyIds: string[] = []
    const idToTrack = new Map<string, ScoredTrack>()

    for (const track of tracks) {
        if (track.track.url?.includes('open.spotify.com/track/')) {
            const match = track.track.url.match(/track\/([a-zA-Z0-9]+)/)
            if (match?.[1]) {
                spotifyIds.push(match[1])
                idToTrack.set(match[1], track)
            }
        }
    }

    if (spotifyIds.length === 0) return tracks

    const features = await getBatchAudioFeatures(token, spotifyIds).catch(
        () => new Map<string, SpotifyAudioFeatures>(),
    )

    // Genre-family scoring moved to in-pass `calculateRecommendationScore`
    // via Last.fm tags so it works without a Spotify token. This pass is now
    // limited to audio-feature (energy/valence) deltas, which the
    // Last.fm-tag path can't substitute for.
    void currentArtistName

    for (const [id, feature] of features) {
        const track = idToTrack.get(id)
        if (!track) continue

        const energyDelta = Math.abs(feature.energy - currentFeatures.energy)
        const valenceDelta = Math.abs(feature.valence - currentFeatures.valence)

        if (energyDelta < 0.15 && valenceDelta < 0.2) {
            track.score += SCORE_DURATION_MATCH
        } else if (energyDelta < 0.3 || valenceDelta < 0.35) {
            track.score += 0.07
        } else if (energyDelta > 0.6) {
            track.score += SCORE_ACOUSTICNESS_MATCH * -1
        }

        if (currentFeatures.tempo && feature.tempo) {
            const tempoDelta = Math.abs(currentFeatures.tempo - feature.tempo)
            if (tempoDelta > 40) track.score += SCORE_TEMPO_PENALTY_LARGE
            else if (tempoDelta > TEMPO_DELTA_SMALL)
                track.score += SCORE_TEMPO_PENALTY_SMALL
        }

        if (
            currentFeatures.acousticness !== undefined &&
            feature.acousticness !== undefined
        ) {
            if (
                currentFeatures.acousticness > 0.6 &&
                feature.acousticness > 0.5
            ) {
                track.score += SCORE_ACOUSTICNESS_MATCH
            } else if (
                currentFeatures.acousticness < 0.2 &&
                feature.acousticness > 0.6
            ) {
                track.score -= SCORE_ACOUSTICNESS_MATCH
            }
        }
    }

    return tracks.sort((a, b) => b.score - a.score)
}
