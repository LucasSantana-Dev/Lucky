import { cleanTitle, cleanAuthor } from './searchQueryCleaner'

function stripFeaturing(author: string): string {
    const lower = author.toLowerCase()
    for (const kw of [' feat ', ' ft ', ' con ', ' with ']) {
        const idx = lower.indexOf(kw)
        if (idx >= 0) return author.slice(0, idx)
    }
    return author
}

export function normalizeTrackKey(title?: string, author?: string): string {
    const cleanedTitle = title ? cleanTitle(title) : ''
    const primaryAuthor = author
        ? stripFeaturing(cleanAuthor(author).split(',')[0] ?? '').trim()
        : ''
    return `${normalizeText(cleanedTitle)}::${normalizeText(primaryAuthor)}`
}

export function normalizeText(value?: string): string {
    return (value ?? '')
        .normalize('NFKC')
        .toLowerCase()
        .replaceAll(/[^\p{L}\p{N}]+/gu, '')
        .trim()
}

export const FUZZY_TITLE_THRESHOLD = 0.82

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
