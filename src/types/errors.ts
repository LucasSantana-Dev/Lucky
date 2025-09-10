/**
 * Error handling types and interfaces following structured error handling patterns
 */

export enum ErrorCode {
    // Authentication & Authorization
    AUTH_TOKEN_INVALID = "ERR_AUTH_TOKEN_INVALID",
    AUTH_TOKEN_EXPIRED = "ERR_AUTH_TOKEN_EXPIRED",
    AUTH_PERMISSION_DENIED = "ERR_AUTH_PERMISSION_DENIED",

    // Network & API
    NETWORK_TIMEOUT = "ERR_NETWORK_TIMEOUT",
    NETWORK_CONNECTION_FAILED = "ERR_NETWORK_CONNECTION_FAILED",
    API_RATE_LIMITED = "ERR_API_RATE_LIMITED",
    API_SERVICE_UNAVAILABLE = "ERR_API_SERVICE_UNAVAILABLE",

    // Discord Bot
    DISCORD_VOICE_CONNECTION_FAILED = "ERR_DISCORD_VOICE_CONNECTION_FAILED",
    DISCORD_PERMISSION_MISSING = "ERR_DISCORD_PERMISSION_MISSING",
    DISCORD_GUILD_NOT_FOUND = "ERR_DISCORD_GUILD_NOT_FOUND",
    DISCORD_CHANNEL_NOT_FOUND = "ERR_DISCORD_CHANNEL_NOT_FOUND",

    // Music & Media
    MUSIC_TRACK_NOT_FOUND = "ERR_MUSIC_TRACK_NOT_FOUND",
    MUSIC_PLAYLIST_NOT_FOUND = "ERR_MUSIC_PLAYLIST_NOT_FOUND",
    MUSIC_QUEUE_EMPTY = "ERR_MUSIC_QUEUE_EMPTY",
    MUSIC_PLAYBACK_FAILED = "ERR_MUSIC_PLAYBACK_FAILED",
    MUSIC_DOWNLOAD_FAILED = "ERR_MUSIC_DOWNLOAD_FAILED",

    // YouTube & External Services
    YOUTUBE_PARSER_ERROR = "ERR_YOUTUBE_PARSER_ERROR",
    YOUTUBE_QUOTA_EXCEEDED = "ERR_YOUTUBE_QUOTA_EXCEEDED",
    SPOTIFY_AUTH_FAILED = "ERR_SPOTIFY_AUTH_FAILED",
    SPOTIFY_TRACK_NOT_FOUND = "ERR_SPOTIFY_TRACK_NOT_FOUND",

    // Validation & Input
    VALIDATION_INVALID_INPUT = "ERR_VALIDATION_INVALID_INPUT",
    VALIDATION_MISSING_REQUIRED_FIELD = "ERR_VALIDATION_MISSING_REQUIRED_FIELD",
    VALIDATION_OUT_OF_RANGE = "ERR_VALIDATION_OUT_OF_RANGE",

    // System & Configuration
    CONFIG_MISSING_ENV_VAR = "ERR_CONFIG_MISSING_ENV_VAR",
    CONFIG_INVALID_VALUE = "ERR_CONFIG_INVALID_VALUE",
    SYSTEM_RESOURCE_EXHAUSTED = "ERR_SYSTEM_RESOURCE_EXHAUSTED",

    // Generic
    UNKNOWN_ERROR = "ERR_UNKNOWN_ERROR",
    OPERATION_FAILED = "ERR_OPERATION_FAILED",
}

export interface ErrorMetadata {
    readonly correlationId?: string
    readonly userId?: string
    readonly guildId?: string
    readonly channelId?: string
    readonly retryable?: boolean
    readonly statusCode?: number
    readonly details?: Record<string, unknown>
    readonly timestamp: Date
    readonly query?: string
    readonly originalError?: string
}

export interface StructuredError extends Error {
    readonly code: ErrorCode
    readonly metadata: ErrorMetadata
    readonly cause?: Error
}

export class BotError extends Error implements StructuredError {
    public readonly code: ErrorCode
    public readonly metadata: ErrorMetadata
    public readonly cause?: Error

    constructor(
        code: ErrorCode,
        message: string,
        metadata: Partial<ErrorMetadata> = {},
        cause?: Error,
    ) {
        super(message)
        this.name = "BotError"
        this.code = code
        this.metadata = {
            timestamp: new Date(),
            ...metadata,
        }
        this.cause = cause

        // Maintain proper stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, BotError)
        }
    }

    /**
     * Creates a user-friendly error message for Discord embeds
     */
    getUserMessage(): string {
        return this.message
    }

    /**
     * Creates a detailed error message for logging
     */
    getLogMessage(): string {
        const parts = [
            `[${this.code}] ${this.message}`,
            `Correlation ID: ${this.metadata.correlationId ?? "N/A"}`,
            `Retryable: ${this.metadata.retryable ? "Yes" : "No"}`,
        ]

        if (this.cause) {
            parts.push(`Caused by: ${this.cause.message}`)
        }

        return parts.join(" | ")
    }

    /**
     * Checks if this error should trigger a retry
     */
    isRetryable(): boolean {
        return this.metadata.retryable ?? false
    }
}

// Domain-specific error classes
export class AuthenticationError extends BotError {
    constructor(
        message: string,
        metadata: Partial<ErrorMetadata> = {},
        cause?: Error,
    ) {
        super(ErrorCode.AUTH_PERMISSION_DENIED, message, metadata, cause)
        this.name = "AuthenticationError"
    }
}

export class NetworkError extends BotError {
    constructor(
        message: string,
        metadata: Partial<ErrorMetadata> = {},
        cause?: Error,
    ) {
        super(
            ErrorCode.NETWORK_CONNECTION_FAILED,
            message,
            { retryable: true, ...metadata },
            cause,
        )
        this.name = "NetworkError"
    }
}

export class MusicError extends BotError {
    constructor(
        code: ErrorCode,
        message: string,
        metadata: Partial<ErrorMetadata> = {},
        cause?: Error,
    ) {
        super(code, message, metadata, cause)
        this.name = "MusicError"
    }
}

export class YouTubeError extends BotError {
    constructor(
        message: string,
        metadata: Partial<ErrorMetadata> = {},
        cause?: Error,
    ) {
        super(
            ErrorCode.YOUTUBE_PARSER_ERROR,
            message,
            { retryable: true, ...metadata },
            cause,
        )
        this.name = "YouTubeError"
    }
}

export class ValidationError extends BotError {
    constructor(
        message: string,
        metadata: Partial<ErrorMetadata> = {},
        cause?: Error,
    ) {
        super(ErrorCode.VALIDATION_INVALID_INPUT, message, metadata, cause)
        this.name = "ValidationError"
    }
}

export class ConfigurationError extends BotError {
    constructor(
        message: string,
        metadata: Partial<ErrorMetadata> = {},
        cause?: Error,
    ) {
        super(ErrorCode.CONFIG_MISSING_ENV_VAR, message, metadata, cause)
        this.name = "ConfigurationError"
    }
}
