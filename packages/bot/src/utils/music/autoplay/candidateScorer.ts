import { LRUCache } from 'lru-cache'
import type { Track } from 'discord-player'
import type { SpotifyAudioFeatures } from '../../../spotify/spotifyApi'
import {
    getBatchAudioFeatures,
    getArtistGenres,
} from '../../../spotify/spotifyApi'
import { spotifyLinkService } from '@lucky/shared/services'
import type { SessionMood } from './sessionMood'
import { cleanAuthor } from '../searchQueryCleaner'

interface AudioFeatureEntry {
    value: SpotifyAudioFeatures | null
}

const audioFeatureCache = new LRUCache<string, AudioFeatureEntry>({
    max: 10000,
    ttl: 24 * 60 * 60 * 1000,
})

type ScoredTrack = {
    track: Track
    score: number
    reason: string
}

const GENRE_FAMILIES = {
    rap_hiphop: ['hip hop', 'rap', 'trap', 'drill', 'gangster rap', 'g-funk'],
    rnb_soul: ['r&b', 'soul', 'neo soul'],
    electronic: ['edm', 'house', 'techno', 'trance', 'dubstep', 'drum and bass', 'electro', 'synthwave'],
    rock_metal: ['rock', 'metal', 'punk', 'grunge', 'alternative'],
    pop: ['pop', 'dance pop', 'latin pop', 'k-pop', 'indie pop'],
    latin: ['reggaeton', 'forró', 'samba', 'bossa nova', 'latin trap', 'trap latino'],
    country_folk: ['country', 'folk', 'bluegrass'],
    jazz_classical: ['jazz', 'classical', 'orchestral'],
    world: ['afrobeat', 'desi', 'bhangra'],
    ambient_chill: ['lofi', 'chillwave', 'downtempo', 'ambient'],
}

const AMBIENT_NOISE_RE =
    /\b(?:rain sounds?|rain for sleep|ocean waves?|waves? sounds?|nature sounds?|forest sounds?|thunder sounds?|white noise|brown noise|pink noise|asmr|sleep sounds?|sleep music|relaxing rain|ambient sounds?|binaural beats?|solfeggio|healing frequ|528 ?hz|432 ?hz|963 ?hz|chakra healing|spa music|massage music|yoga music|deep sleep|baby sleep|guided meditation|meditation music)\b/i // NOSONAR S5852 — trusted track title from internal API, not user input

const EDM_MIX_RE =
    /\b(?:dj set|festival set|\d+ ?(?:hour|hr) mix|extended mix|club mix|nightclub mix|edm mix|trance mix)\b/i // NOSONAR S5852 — trusted track title from internal API, not user input

const SPANISH_LOCALE_RE =
    /\b(?:reggaeton|reggaet[oó]n|dembow|trap latino|latin trap|cumbia|bachata|merengue|ranchera|corrido|vallenato|banda)\b/i // NOSONAR S5852

// Helpers from queueManipulation that are needed for score calculation
function normalizeText(value?: string): string {
    return (value ?? '')
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '')
        .trim()
}

function normalizeTrackKey(title?: string, author?: string): string {
    const cleanedAuthor = author
        ? author.split(',')[0]?.trim() ?? ''
        : ''
    return `${normalizeText(title)}::${normalizeText(cleanedAuthor)}`
}

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
        return -0.1
    }

    for (const family of currentFamilies) {
        if (candidateFamilies.has(family)) {
            return 0
        }
    }

    const strongGenres = ['rap_hiphop', 'rock_metal', 'latin']
    const isStrongGenre = Array.from(currentFamilies).some((f) =>
        strongGenres.includes(f),
    )

    return isStrongGenre ? -0.6 : -0.3
}

export function calculateRecommendationScore(
    candidate: Track,
    currentTrack: Track,
    recentArtists: Set<string>,
    likedWeights: Map<string, number> = new Map(),
    preferredArtistKeys: Set<string> = new Set(),
    blockedArtistKeys: Set<string> = new Set(),
    autoplayMode: 'similar' | 'discover' | 'popular' = 'similar',
    artistFrequency: Map<string, number> = new Map(),
    implicitDislikeKeys: Set<string> = new Set(),
    implicitLikeKeys: Set<string> = new Set(),
    dislikedWeights: Map<string, number> = new Map(),
    sessionMood: SessionMood | null = null,
    skipNoveltyBoost = false,
): { score: number; reason: string } {
    const currentArtist = currentTrack.author.toLowerCase()
    const candidateArtist = candidate.author.toLowerCase()
    const candidateArtistKey = normalizeText(cleanAuthor(candidate.author))

    if (blockedArtistKeys.has(candidateArtistKey)) {
        return { score: -Infinity, reason: 'blocked artist' }
    }

    const MAX_CANDIDATE_DURATION_MS = 15 * 60 * 1000
    if (
        candidate.durationMS &&
        candidate.durationMS > MAX_CANDIDATE_DURATION_MS
    ) {
        return { score: -Infinity, reason: 'track too long' }
    }

    const candidateTitle = candidate.title ?? ''
    if (AMBIENT_NOISE_RE.test(candidateTitle)) {
        return { score: -Infinity, reason: 'ambient/noise content' }
    }
    if (EDM_MIX_RE.test(candidateTitle)) {
        return { score: -Infinity, reason: 'dj mix / edm set' }
    }

    let score = 1
    const reasons: string[] = []

    if (
        sessionMood !== null &&
        sessionMood.dominantLocale === null &&
        SPANISH_LOCALE_RE.test(candidateTitle)
    ) {
        score -= 0.45
        reasons.push('genre mismatch: latin/spanish')
    }

    if (preferredArtistKeys.has(candidateArtistKey)) {
        score += 0.3
        reasons.push('preferred artist')
    }

    const freq = artistFrequency.get(candidateArtistKey) ?? 0
    if (freq >= 5) {
        score += 0.3
        reasons.push('favourite artist')
    } else if (freq >= 3) {
        score += 0.2
        reasons.push('liked artist')
    } else if (freq >= 1) {
        score += 0.1
        reasons.push('known artist')
    }

    const candidateKey = normalizeTrackKey(candidate.title, candidate.author)
    const likedWeight = likedWeights.get(candidateKey)
    if (likedWeight !== undefined) {
        score += 0.3 * likedWeight
        reasons.push('liked track')
    }

    const dislikedWeight = dislikedWeights.get(candidateKey)
    if (dislikedWeight !== undefined) {
        if (dislikedWeight > 0.5) {
            return { score: -Infinity, reason: 'disliked' }
        }
        score -= 0.3 * dislikedWeight
        reasons.push('old dislike')
    }

    if (implicitDislikeKeys.has(candidateKey)) {
        score -= 0.35
        reasons.push('skipped before')
    }
    if (implicitLikeKeys.has(candidateKey)) {
        score += 0.25
        reasons.push('completed before')
    }

    if (candidateArtist === currentArtist) {
        score -= 0.35
        const titleSim = sharedTitleTokenScore(
            candidate.title ?? '',
            currentTrack.title ?? '',
        )
        if (titleSim > 0.4) {
            score += 0.12
            reasons.push('album match')
        }
    } else if (!skipNoveltyBoost && !recentArtists.has(candidateArtist)) {
        score += 0.15
        reasons.push('session novelty')
    }
    if (
        candidate.source === currentTrack.source &&
        candidate.source !== 'spotify'
    ) {
        score -= 0.25
    } else if (candidate.source && candidate.source !== currentTrack.source) {
        reasons.push('source variety')
    }
    const tokenScore = sharedTitleTokenScore(
        candidate.title,
        currentTrack.title,
    )
    score += tokenScore
    if (tokenScore > 0) {
        reasons.push('similar title mood')
    }
    if (
        currentTrack.durationMS &&
        candidate.durationMS &&
        currentTrack.durationMS > 0
    ) {
        const ratio = candidate.durationMS / currentTrack.durationMS
        if (ratio >= 0.8 && ratio <= 1.2) {
            score += 0.15
            reasons.push('similar energy')
        } else if (ratio >= 0.7 && ratio <= 1.3) {
            score += 0.05
        }
    }

    if (candidate.durationMS && candidate.durationMS > 7 * 60 * 1000) {
        score -= 0.2
        reasons.push('long track penalty')
    }

    if (sessionMood) {
        const durationMs = candidate.durationMS ?? 0
        if (
            sessionMood.deepDiveArtist &&
            candidateArtist === sessionMood.deepDiveArtist
        ) {
            score += 0.15
            reasons.push('deep dive')
        }
        if (sessionMood.preferLong && durationMs > 300_000) {
            score += 0.1
            reasons.push('long track match')
        }
        if (sessionMood.preferShort && durationMs > 0 && durationMs < 180_000) {
            score += 0.1
            reasons.push('quick hit match')
        }
        if (sessionMood.restless) {
            if (!recentArtists.has(candidateArtist)) {
                score += 0.1
                reasons.push('restless discovery')
            }
        }
    }

    if (candidate.source === 'spotify') {
        score += 0.4
        reasons.push('spotify preferred')
    }

    if (
        /\b(?:acoustic|live|ao\s{0,3}vivo|ac[uú]stico|cover|karaoke|instrumental)\b/i.test(
            candidate.title ?? '',
        )
    ) {
        score -= 0.2
        reasons.push('version variant')
    }

    if (
        /\b(?:legendad[ao]|traduzido|tradução|legendas?)\b/i.test(
            candidate.title ?? '',
        ) ||
        /\(tributo[^)]*\)/i.test(candidate.title ?? '') ||
        /\(\d{1,2}:\d{2}:\d{2}\)/.test(candidate.title ?? '')
    ) {
        score -= 0.4
        reasons.push('low quality upload')
    }

    if (autoplayMode === 'discover') {
        if (!recentArtists.has(candidateArtist)) {
            score += 0.25
            reasons.push('discovery boost')
        }
        if (recentArtists.has(candidateArtist)) {
            score -= 0.2
        }
    } else if (autoplayMode === 'popular') {
        if (likedWeight !== undefined) {
            score += 0.2 * likedWeight
        }
        if (candidate.durationMS && currentTrack.durationMS) {
            const ratio = candidate.durationMS / currentTrack.durationMS
            if (ratio >= 0.9 && ratio <= 1.1) {
                score += 0.1
                reasons.push('energy match')
            }
        }
    }

    return {
        score,
        reason:
            reasons.length > 0 ? reasons.join(' • ') : 'balanced autoplay pick',
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

    return Math.min(0.2, matches * 0.05)
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
        () => new Map(),
    )

    let currentGenres: string[] = []
    if (currentArtistName) {
        currentGenres = await getArtistGenres(token, currentArtistName).catch(
            () => [],
        )
    }

    for (const [id, feature] of features) {
        const track = idToTrack.get(id)
        if (!track) continue

        const energyDelta = Math.abs(feature.energy - currentFeatures.energy)
        const valenceDelta = Math.abs(feature.valence - currentFeatures.valence)

        if (energyDelta < 0.15 && valenceDelta < 0.2) {
            track.score += 0.15
        } else if (energyDelta < 0.3 || valenceDelta < 0.35) {
            track.score += 0.07
        } else if (energyDelta > 0.6) {
            track.score -= 0.1
        }

        if (currentGenres.length > 0) {
            const candidateGenres = await getArtistGenres(
                token,
                track.track.author,
            ).catch(() => [])
            const genrePenalty = calculateGenreFamilyPenalty(
                currentGenres,
                candidateGenres,
            )
            if (genrePenalty !== 0) {
                track.score += genrePenalty
                if (genrePenalty < -0.3) {
                    track.reason += ' • genre family drift'
                }
            }
        }
    }

    return tracks.sort((a, b) => b.score - a.score)
}
