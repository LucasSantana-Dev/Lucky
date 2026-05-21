/**
 * YouTube Integration Smoke Test
 *
 * This test exercises the end-to-end YouTube path (search → resolve → audio URL)
 * using a stable public video to catch upstream breakage in YouTubei.js, discord-player-youtubei,
 * yt-dlp, and related dependencies.
 *
 * JEST LIMITATION:
 * discord-player-youtubei has ESM-only dependencies (youtubei.js) that cannot be loaded
 * via jest's CommonJS transpiler. This test would need to run via:
 * - Node.js directly with proper ESM/CommonJS bridge (esbuild or tsx)
 * - Or in CI as a separate playwright/e2e test after bot initializes
 *
 * For now: Test documents the intent; CI wiring will verify via integration test runner.
 */

import { describe, it, expect } from '@jest/globals'

// Test is marked as pending (skipped) due to ESM module limitation in jest CommonJS mode.
// Once jest config switches to ESM or we wire a CI integration runner, promote from skip to active.
describe.skip('YouTube Integration Smoke', () => {
    it('should search and resolve a stable YouTube track via discord-player-youtubei', () => {
        // Stable public video: "Me at the zoo" by Jawed Karim (first YouTube video, 2005)
        // Video ID: jNQXAC9IVRw
        // Expected: player.search() → result.hasTracks() = true → track with valid duration & url
        expect(true).toBe(true) // Placeholder; actual test requires ESM module support
    })

    it('should search YouTube by query', () => {
        // Query: "me at the zoo"
        // Expected: player.search() → top result title contains 'zoo'
        expect(true).toBe(true) // Placeholder; actual test requires ESM module support
    })
})
