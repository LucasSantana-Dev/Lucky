import axios from 'axios'

export interface LyricsResult {
    title: string
    artist: string
    lyrics: string
    source: string
}

export interface LyricsError {
    error: string
    message: string
}

/**
 * Service for fetching song lyrics from multiple sources
 * Uses free APIs without authentication requirements
 */
export class LyricsService {
    private static readonly TIMEOUT = 10000 // 10 seconds

    /**
     * Search for lyrics using song title and optional artist
     * Tries multiple sources in order of reliability
     */
    async searchLyrics(
        title: string,
        artist?: string,
    ): Promise<LyricsResult | LyricsError> {
        // Clean up the title and artist
        const cleanTitle = this.cleanSearchQuery(title)
        const cleanArtist = artist ? this.cleanSearchQuery(artist) : undefined

        // Try primary source first (lyrics.ovh)
        try {
            const result = await this.fetchFromLyricsOvh(
                cleanTitle,
                cleanArtist,
            )
            if (result) return result
        } catch (error) {
            console.error('LyricsOVH failed:', error)
        }

        // Fallback: Try extracting from title if it contains artist
        if (!cleanArtist && cleanTitle.includes('-')) {
            const [extractedArtist, extractedTitle] = cleanTitle
                .split('-')
                .map((s) => s.trim())
            try {
                const result = await this.fetchFromLyricsOvh(
                    extractedTitle,
                    extractedArtist,
                )
                if (result) return result
            } catch (error) {
                console.error('LyricsOVH with extracted artist failed:', error)
            }
        }

        return {
            error: 'NOT_FOUND',
            message: `Could not find lyrics for "${title}"${artist ? ` by ${artist}` : ''}`,
        }
    }

    /**
     * Fetch lyrics from lyrics.ovh API
     * Free API, no authentication required
     */
    private async fetchFromLyricsOvh(
        title: string,
        artist?: string,
    ): Promise<LyricsResult | null> {
        if (!artist) return null

        const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`

        try {
            const response = await axios.get(url, {
                timeout: LyricsService.TIMEOUT,
                headers: {
                    'User-Agent': 'LukBot/1.0',
                },
            })

            if (response.data && response.data.lyrics) {
                return {
                    title,
                    artist,
                    lyrics: response.data.lyrics.trim(),
                    source: 'lyrics.ovh',
                }
            }

            return null
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                return null // Not found, try next source
            }
            throw error
        }
    }

    /**
     * Clean search query by removing common suffixes and special characters
     */
    private cleanSearchQuery(query: string): string {
        return (
            query
                // Remove common suffixes
                .replace(/\s*\(.*?\)\s*/g, '') // Remove parentheses content
                .replace(/\s*\[.*?\]\s*/g, '') // Remove brackets content
                .replace(
                    /\s*-\s*(official|audio|video|lyric|music|mv|hd|4k).*$/i,
                    '',
                )
                // Remove special characters but keep spaces and hyphens
                .replace(/[^\w\s-]/g, '')
                .trim()
        )
    }

    /**
     * Split lyrics into chunks that fit Discord's message limit (2000 chars)
     * Tries to split at paragraph breaks for better readability
     */
    splitLyrics(lyrics: string, maxLength: number = 1900): string[] {
        if (lyrics.length <= maxLength) {
            return [lyrics]
        }

        const chunks: string[] = []
        const paragraphs = lyrics.split('\n\n')
        let currentChunk = ''

        for (const paragraph of paragraphs) {
            // If single paragraph is too long, split by lines
            if (paragraph.length > maxLength) {
                if (currentChunk) {
                    chunks.push(currentChunk.trim())
                    currentChunk = ''
                }

                const lines = paragraph.split('\n')
                for (const line of lines) {
                    if ((currentChunk + '\n' + line).length > maxLength) {
                        if (currentChunk) {
                            chunks.push(currentChunk.trim())
                        }
                        currentChunk = line
                    } else {
                        currentChunk += (currentChunk ? '\n' : '') + line
                    }
                }
            } else {
                // Try to add paragraph to current chunk
                if ((currentChunk + '\n\n' + paragraph).length > maxLength) {
                    chunks.push(currentChunk.trim())
                    currentChunk = paragraph
                } else {
                    currentChunk += (currentChunk ? '\n\n' : '') + paragraph
                }
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk.trim())
        }

        return chunks
    }
}

export const lyricsService = new LyricsService()
