/**
 * Unit tests for string utilities
 * Testing behavior, not implementation details
 */

import { describe, it, expect } from "@jest/globals"
import {
    normalizeString,
    cleanString,
    extractArtistTitle,
    isSimilarTitle,
    cleanTrackTitle,
    extractYear,
    isAlphanumeric,
    truncateString,
    toTitleCase,
    removeDiacritics,
    isStringSimilar,
} from "./stringUtils"

describe("String Utilities", () => {
    describe("normalizeString", () => {
        it("should normalize strings to lowercase alphanumeric", () => {
            expect(normalizeString("Hello World")).toBe("helloworld")
            expect(normalizeString("Test-String_123")).toBe("teststring123")
            expect(normalizeString("Special!@#$%^&*()")).toBe("special")
        })

        it("should handle unicode characters", () => {
            expect(normalizeString("Café")).toBe("caf")
            expect(normalizeString("naïve")).toBe("nave") // Removes diacritics
        })

        it("should handle empty strings", () => {
            expect(normalizeString("")).toBe("")
        })
    })

    describe("cleanString", () => {
        it("should remove extra whitespace", () => {
            expect(cleanString("  Hello World  ")).toBe("Hello World")
            expect(cleanString("\n\tTest\n\t")).toBe("Test")
            expect(cleanString("Multiple    Spaces")).toBe("Multiple Spaces")
        })

        it("should handle empty strings", () => {
            expect(cleanString("")).toBe("")
            expect(cleanString("   ")).toBe("")
        })
    })

    describe("extractArtistTitle", () => {
        it("should extract artist and title from various formats", () => {
            const result1 = extractArtistTitle("Artist - Title")
            expect(result1.artist).toBe("Artist")
            expect(result1.title).toBe("Title")

            const result2 = extractArtistTitle("Artist: Title")
            expect(result2.artist).toBe("Artist")
            expect(result2.title).toBe("Title")

            const result3 = extractArtistTitle("Artist | Title")
            expect(result3.artist).toBe("Artist")
            expect(result3.title).toBe("Title")
        })

        it("should handle single string as title", () => {
            const result = extractArtistTitle("Just a Title")
            expect(result.artist).toBe("")
            expect(result.title).toBe("Just a Title")
        })

        it("should handle empty strings", () => {
            const result = extractArtistTitle("")
            expect(result.artist).toBe("")
            expect(result.title).toBe("")
        })
    })

    describe("isSimilarTitle", () => {
        it("should detect similar titles", () => {
            expect(isSimilarTitle("Song Title", "Song Title")).toBe(true)
            expect(isSimilarTitle("Song Title", "song title")).toBe(true)
            expect(isSimilarTitle("Song Title", "Song  Title")).toBe(true)
            expect(isSimilarTitle("Song Title", "Song-Title")).toBe(true)
        })

        it("should detect different titles", () => {
            expect(isSimilarTitle("Song Title", "Different Song")).toBe(false)
            expect(isSimilarTitle("Song Title", "Song")).toBe(false)
            expect(isSimilarTitle("Song Title", "Title Song")).toBe(false)
        })

        it("should handle empty strings", () => {
            expect(isSimilarTitle("", "")).toBe(true)
            expect(isSimilarTitle("Song", "")).toBe(false)
            expect(isSimilarTitle("", "Song")).toBe(false)
        })
    })

    describe("cleanTrackTitle", () => {
        it("should remove common prefixes and suffixes", () => {
            expect(cleanTrackTitle("Official Video - Song Title")).toBe(
                "- Song Title",
            )
            expect(cleanTrackTitle("Song Title (Official Audio)")).toBe(
                "Song Title",
            )
            expect(cleanTrackTitle("[HD] Song Title [Music Video]")).toBe(
                "Song Title",
            )
        })

        it("should handle titles without prefixes/suffixes", () => {
            expect(cleanTrackTitle("Simple Song Title")).toBe(
                "Simple Song Title",
            )
        })
    })

    describe("extractYear", () => {
        it("should extract years from strings", () => {
            expect(extractYear("Song Title 2023")).toBe(2023)
            expect(extractYear("Album (1995)")).toBe(1995)
            expect(extractYear("No year here")).toBe(null)
        })

        it("should handle multiple years", () => {
            expect(extractYear("2020-2023 Collection")).toBe(2020)
        })
    })

    describe("isAlphanumeric", () => {
        it("should check alphanumeric strings", () => {
            expect(isAlphanumeric("abc123")).toBe(true)
            expect(isAlphanumeric("ABC123")).toBe(true)
            expect(isAlphanumeric("abc-123")).toBe(false)
            expect(isAlphanumeric("abc 123")).toBe(false)
        })
    })

    describe("truncateString", () => {
        it("should truncate long strings", () => {
            expect(truncateString("Short", 10)).toBe("Short")
            expect(truncateString("This is a very long string", 10)).toBe(
                "This is...",
            )
        })

        it("should handle strings at exact length", () => {
            expect(truncateString("Exactly", 7)).toBe("Exactly")
        })
    })

    describe("toTitleCase", () => {
        it("should convert to title case", () => {
            expect(toTitleCase("hello world")).toBe("Hello World")
            expect(toTitleCase("HELLO WORLD")).toBe("Hello World")
        })
    })

    describe("removeDiacritics", () => {
        it("should remove diacritics", () => {
            expect(removeDiacritics("café")).toBe("cafe")
            expect(removeDiacritics("naïve")).toBe("naive")
            expect(removeDiacritics("résumé")).toBe("resume")
        })
    })

    describe("isStringSimilar", () => {
        it("should detect similar strings", () => {
            expect(isStringSimilar("hello", "helo", 0.8)).toBe(true)
            expect(isStringSimilar("hello", "world", 0.8)).toBe(false)
        })

        it("should respect similarity threshold", () => {
            expect(isStringSimilar("hello", "helo", 0.9)).toBe(false)
            expect(isStringSimilar("hello", "helo", 0.7)).toBe(true)
        })
    })
})
