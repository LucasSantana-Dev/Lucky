/**
 * Simple test to verify Jest setup
 */

import { describe, it, expect } from "@jest/globals"

describe("Jest Setup", () => {
    it("should run basic tests", () => {
        expect(1 + 1).toBe(2)
    })

    it("should handle async operations", async () => {
        const result = await Promise.resolve("test")
        expect(result).toBe("test")
    })

    it("should work with TypeScript", () => {
        const message: string = "Hello TypeScript"
        expect(message).toContain("TypeScript")
    })
})
