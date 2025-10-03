/**
 * Unit tests for error handling types and classes
 * Testing error behavior and user-friendly messages
 */

import { describe, it, expect } from "@jest/globals"
import {
    ErrorCode,
    BotError,
    AuthenticationError,
    NetworkError,
    MusicError,
    YouTubeError,
    ValidationError,
    ConfigurationError,
} from "./errors"

describe("Error Handling System", () => {
    describe("ErrorCode Constants", () => {
        it("should have all required error codes", () => {
            expect(ErrorCode.AUTH_TOKEN_INVALID).toBe("ERR_AUTH_TOKEN_INVALID")
            expect(ErrorCode.NETWORK_CONNECTION_FAILED).toBe(
                "ERR_NETWORK_CONNECTION_FAILED",
            )
            expect(ErrorCode.MUSIC_PLAYBACK_FAILED).toBe(
                "ERR_MUSIC_PLAYBACK_FAILED",
            )
            expect(ErrorCode.YOUTUBE_PARSER_ERROR).toBe(
                "ERR_YOUTUBE_PARSER_ERROR",
            )
            expect(ErrorCode.VALIDATION_INVALID_INPUT).toBe(
                "ERR_VALIDATION_INVALID_INPUT",
            )
            expect(ErrorCode.CONFIG_MISSING_ENV_VAR).toBe(
                "ERR_CONFIG_MISSING_ENV_VAR",
            )
            expect(ErrorCode.UNKNOWN_ERROR).toBe("ERR_UNKNOWN_ERROR")
        })
    })

    describe("BotError Class", () => {
        it("should create error with correct properties", () => {
            const error = new BotError(
                ErrorCode.MUSIC_PLAYBACK_FAILED,
                "Music playback failed",
                { correlationId: "test-123", userId: "user-456" },
            )

            expect(error.name).toBe("BotError")
            expect(error.message).toBe("Music playback failed")
            expect(error.code).toBe(ErrorCode.MUSIC_PLAYBACK_FAILED)
            expect(error.metadata.correlationId).toBe("test-123")
            expect(error.metadata.userId).toBe("user-456")
            expect(error.metadata.timestamp).toBeInstanceOf(Date)
        })

        it("should handle cause errors", () => {
            const cause = new Error("Original error")
            const error = new BotError(
                ErrorCode.NETWORK_CONNECTION_FAILED,
                "Network failed",
                {},
                cause,
            )

            expect(error.cause).toBe(cause)
        })

        it("should generate user-friendly messages", () => {
            const error = new BotError(
                ErrorCode.MUSIC_PLAYBACK_FAILED,
                "Technical error message",
            )

            const userMessage = error.getUserMessage()
            expect(userMessage).toBe(
                "🎵 Music playback error. Please try again.",
            )
        })

        it("should generate detailed log messages", () => {
            const error = new BotError(
                ErrorCode.MUSIC_PLAYBACK_FAILED,
                "Music failed",
                { correlationId: "test-123" },
            )

            const logMessage = error.getLogMessage()
            expect(logMessage).toContain("[ERR_MUSIC_PLAYBACK_FAILED]")
            expect(logMessage).toContain("Music failed")
            expect(logMessage).toContain("test-123")
        })

        it("should check retryable status", () => {
            const retryableError = new BotError(
                ErrorCode.NETWORK_CONNECTION_FAILED,
                "Network error",
                { retryable: true },
            )

            const nonRetryableError = new BotError(
                ErrorCode.AUTH_PERMISSION_DENIED,
                "Permission denied",
                { retryable: false },
            )

            expect(retryableError.isRetryable()).toBe(true)
            expect(nonRetryableError.isRetryable()).toBe(false)
        })
    })

    describe("Domain-specific Error Classes", () => {
        it("should create AuthenticationError", () => {
            const error = new AuthenticationError("Invalid token")
            expect(error.name).toBe("AuthenticationError")
            expect(error.code).toBe(ErrorCode.AUTH_PERMISSION_DENIED)
        })

        it("should create NetworkError with retryable flag", () => {
            const error = new NetworkError("Connection failed")
            expect(error.name).toBe("NetworkError")
            expect(error.metadata.retryable).toBe(true)
        })

        it("should create MusicError", () => {
            const error = new MusicError(
                ErrorCode.MUSIC_QUEUE_EMPTY,
                "Queue is empty",
            )
            expect(error.name).toBe("MusicError")
            expect(error.code).toBe(ErrorCode.MUSIC_QUEUE_EMPTY)
        })

        it("should create YouTubeError with retryable flag", () => {
            const error = new YouTubeError("Parser failed")
            expect(error.name).toBe("YouTubeError")
            expect(error.metadata.retryable).toBe(true)
        })

        it("should create ValidationError", () => {
            const error = new ValidationError("Invalid input")
            expect(error.name).toBe("ValidationError")
            expect(error.code).toBe(ErrorCode.VALIDATION_INVALID_INPUT)
        })

        it("should create ConfigurationError", () => {
            const error = new ConfigurationError("Missing env var")
            expect(error.name).toBe("ConfigurationError")
            expect(error.code).toBe(ErrorCode.CONFIG_MISSING_ENV_VAR)
        })
    })

    describe("User-friendly Messages", () => {
        it("should provide appropriate messages for different error codes", () => {
            const testCases = [
                {
                    code: ErrorCode.AUTH_PERMISSION_DENIED,
                    expected: "❌ Insufficient permissions",
                },
                {
                    code: ErrorCode.NETWORK_CONNECTION_FAILED,
                    expected: "🌐 Connection error",
                },
                {
                    code: ErrorCode.MUSIC_PLAYBACK_FAILED,
                    expected: "🎵 Music playback error",
                },
                {
                    code: ErrorCode.MUSIC_QUEUE_EMPTY,
                    expected: "📋 Queue error",
                },
                {
                    code: ErrorCode.YOUTUBE_PARSER_ERROR,
                    expected: "🎵 Error processing YouTube content",
                },
                {
                    code: ErrorCode.VALIDATION_INVALID_INPUT,
                    expected: "❌ Invalid data provided",
                },
                {
                    code: ErrorCode.CONFIG_MISSING_ENV_VAR,
                    expected: "⚙️ Configuration error",
                },
                {
                    code: ErrorCode.UNKNOWN_ERROR,
                    expected: "❌ An unexpected error occurred",
                },
            ]

            testCases.forEach(({ code, expected }) => {
                const error = new BotError(code, "Test message")
                expect(error.getUserMessage()).toContain(expected)
            })
        })
    })

    describe("Error Metadata", () => {
        it("should include timestamp in metadata", () => {
            const error = new BotError(ErrorCode.UNKNOWN_ERROR, "Test")
            expect(error.metadata.timestamp).toBeInstanceOf(Date)
        })

        it("should preserve custom metadata", () => {
            const customMetadata = {
                correlationId: "test-123",
                userId: "user-456",
                guildId: "guild-789",
                retryable: true,
            }

            const error = new BotError(
                ErrorCode.UNKNOWN_ERROR,
                "Test",
                customMetadata,
            )
            expect(error.metadata.correlationId).toBe("test-123")
            expect(error.metadata.userId).toBe("user-456")
            expect(error.metadata.guildId).toBe("guild-789")
            expect(error.metadata.retryable).toBe(true)
        })
    })
})
