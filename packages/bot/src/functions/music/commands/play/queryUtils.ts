import { QueryType } from 'discord-player'

export const DISCORD_UNKNOWN_INTERACTION_CODE = 10062

export function isUnknownInteractionError(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: number }).code === DISCORD_UNKNOWN_INTERACTION_CODE
    )
}

export function isUrl(query: string): boolean {
    return query.startsWith('http://') || query.startsWith('https://')
}

export function resolveSearchEngine(query: string, provider?: string | null): QueryType {
    if (isUrl(query)) return QueryType.AUTO

    switch (provider) {
        case 'youtube':
            return QueryType.YOUTUBE_SEARCH
        case 'soundcloud':
            return QueryType.SOUNDCLOUD_SEARCH
        case 'spotify':
        default:
            return QueryType.SPOTIFY_SEARCH
    }
}
