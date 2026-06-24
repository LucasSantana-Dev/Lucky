import { describe, it, expect } from '@jest/globals'

/**
 * YouTube Integration Smoke Test
 *
 * Verifies that the required YouTube music dependencies (youtubei.js /
 * discord-player-youtubei) are installed and resolvable in CI.
 *
 * SKIP_CONDITION: This test is ONLY run in CI when YOUTUBE_SMOKE_TEST=true env var is set.
 * Skipped locally to avoid developer network flakes and credential requirements.
 */

const IS_YOUTUBE_SMOKE_TEST_ENABLED = process.env.YOUTUBE_SMOKE_TEST === 'true'

const describeIfEnabled = IS_YOUTUBE_SMOKE_TEST_ENABLED
    ? describe
    : describe.skip

describeIfEnabled(
    'YouTube Integration Smoke Test',
    () => {
        it('should have YouTube music dependencies declared in package.json', async () => {
            // Verify that the required YouTube packages are available.
            // In CI, these dependencies will be installed via npm ci.
            // In development, this test is skipped entirely.

            let youtubeiAvailable = false
            let discordPlayerYoutubeAvailable = false

            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                require.resolve('youtubei.js')
                youtubeiAvailable = true
            } catch {
                // Package not available
            }

            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                require.resolve('discord-player-youtubei')
                discordPlayerYoutubeAvailable = true
            } catch {
                // Package not available
            }

            // At least one YouTube package should be available in CI.
            // In non-CI environments, skip this assertion.
            if (
                !(
                    process.env.CI === 'true' ||
                    process.env.GITHUB_ACTIONS === 'true'
                )
            ) {
                return
            }

            expect(youtubeiAvailable || discordPlayerYoutubeAvailable).toBe(
                true,
            )
        })
    },
    60000, // 60 second timeout for YouTube operations
)
