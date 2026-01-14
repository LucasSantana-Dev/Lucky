/**
 * Music and media error codes
 */

export const MUSIC_ERROR_CODES = {
    MUSIC_TRACK_NOT_FOUND: 'ERR_MUSIC_TRACK_NOT_FOUND',
    MUSIC_PLAYLIST_NOT_FOUND: 'ERR_MUSIC_PLAYLIST_NOT_FOUND',
    MUSIC_QUEUE_EMPTY: 'ERR_MUSIC_QUEUE_EMPTY',
    MUSIC_PLAYBACK_FAILED: 'ERR_MUSIC_PLAYBACK_FAILED',
    MUSIC_DOWNLOAD_FAILED: 'ERR_MUSIC_DOWNLOAD_FAILED',
} as const

export type MusicErrorCode =
    (typeof MUSIC_ERROR_CODES)[keyof typeof MUSIC_ERROR_CODES]

export class MusicError extends Error {
    public readonly metadata: {
        correlationId: string
        userId?: string
        guildId?: string
        commandName?: string
        details?: Record<string, unknown>
    }

    public readonly code?: MusicErrorCode

    constructor(
        message: string,
        code?: MusicErrorCode,
        metadata?: Partial<MusicError['metadata']>,
    ) {
        super(message)
        this.name = 'MusicError'
        this.code = code
        this.metadata = {
            correlationId: metadata?.correlationId ?? '',
            userId: metadata?.userId,
            guildId: metadata?.guildId,
            commandName: metadata?.commandName,
            details: metadata?.details,
        }
    }
}
