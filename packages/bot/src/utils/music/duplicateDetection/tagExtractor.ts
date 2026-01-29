import type { Track } from 'discord-player'
import { debugLog } from '@lukbot/shared/utils'

function _getGenreKeywords(): string[] {
    return [
        'rock',
        'pop',
        'jazz',
        'blues',
        'country',
        'folk',
        'rap',
        'hip hop',
        'metal',
        'classical',
        'electronic',
        'dance',
        'reggae',
        'funk',
        'soul',
        'r&b',
        'indie',
        'alternative',
        'punk',
        'grunge',
        'disco',
        'techno',
        'house',
        'trance',
        'ambient',
        'acoustic',
        'instrumental',
        'vocal',
    ]
}

/**
 * Extract tags from track title and description
 */
function _extractWordsFromText(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((word: string) => word.length > 3)
}

function addGenreTagsFromWords(tags: Set<string>, words: string[]): void {
    const genreKeywords = _getGenreKeywords()
    words.forEach((word) => {
        if (genreKeywords.includes(word)) {
            tags.add(word)
        }
    })
}

export function extractTags(track: Track): string[] {
    const tags: Set<string> = new Set()

    try {
        const titleWords = _extractWordsFromText(track.title)
        addGenreTagsFromWords(tags, titleWords)

        if (track.description) {
            const descWords = _extractWordsFromText(track.description)
            addGenreTagsFromWords(tags, descWords)
        }

        if (track.author) {
            const artistWords = _extractWordsFromText(track.author)
            addGenreTagsFromWords(tags, artistWords)
        }
    } catch (error) {
        debugLog({ message: 'Error extracting tags:', error })
    }

    return Array.from(tags)
}

/**
 * Extract genre from track metadata
 */
export function extractGenre(track: Track): string | undefined {
    const tags = extractTags(track)

    // Return the first genre tag found
    return tags.find((tag) =>
        [
            'rock',
            'pop',
            'jazz',
            'blues',
            'country',
            'folk',
            'rap',
            'hip hop',
            'metal',
            'classical',
            'electronic',
            'dance',
            'reggae',
            'samba',
            'forro',
            'sertanejo',
            'mpb',
            'funk',
            'soul',
            'r&b',
            'indie',
            'alternative',
            'punk',
            'grunge',
            'techno',
            'house',
            'trance',
            'ambient',
            'acoustic',
            'instrumental',
        ].includes(tag),
    )
}
