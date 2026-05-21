/**
 * YouTube Integration Smoke Test (standalone)
 *
 * This script tests the YouTube resolution path end-to-end:
 * search → track resolution → metadata validation.
 *
 * Usage: npx tsx packages/bot/scripts/youtube-smoke.ts
 *
 * Runs real network calls; suitable for CI only (slow).
 * Gate in CI with: if [[ "${{ github.event_name }}" == "pull_request" && ... ]]; then
 */

import { Player, QueryType } from 'discord-player'
import { Client } from 'discord.js'

async function runYouTubeSmokeTest() {
    console.log('Starting YouTube integration smoke test...')

    const client = new Client({
        intents: [],
    })

    const player = new Player(client)

    try {
        // Load the YouTube extractor
        console.log('Registering YouTube extractor...')
        const mod = await import('discord-player-youtubei')
        const YoutubeExtractor = mod.YoutubeExtractor ?? mod.YoutubeiExtractor

        if (!YoutubeExtractor) {
            throw new Error(
                'No YouTube extractor found in discord-player-youtubei',
            )
        }

        await player.extractors.register(YoutubeExtractor, {})
        console.log('✓ YouTube extractor registered')

        // Test 1: Search stable video by URL
        console.log(
            '\nTest 1: Search stable video by URL (Me at the zoo - jNQXAC9IVRw)...',
        )
        const videoId = 'jNQXAC9IVRw'
        const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`

        const result1 = await player.search(youtubeUrl, {
            requestedBy: { id: 'test-user', tag: 'Test User' } as any,
            searchEngine: QueryType.YOUTUBE_SEARCH,
        })

        if (!result1.hasTracks() || result1.tracks.length === 0) {
            throw new Error('Test 1 failed: No tracks returned for URL search')
        }

        const track1 = result1.tracks[0]
        if (!track1.title || !track1.url || track1.duration <= 0) {
            throw new Error(
                `Test 1 failed: Invalid track metadata. Title=${track1.title}, URL=${track1.url}, Duration=${track1.duration}`,
            )
        }

        console.log(
            `✓ Test 1 passed: Found "${track1.title}" (${track1.duration}ms)`,
        )

        // Test 2: Search by query
        console.log('\nTest 2: Search by query ("me at the zoo")...')
        const result2 = await player.search('me at the zoo', {
            requestedBy: { id: 'test-user', tag: 'Test User' } as any,
            searchEngine: QueryType.YOUTUBE_SEARCH,
        })

        if (!result2.hasTracks() || result2.tracks.length === 0) {
            throw new Error('Test 2 failed: No tracks returned for query search')
        }

        const track2 = result2.tracks[0]
        if (!track2.title || !track2.url) {
            throw new Error(
                `Test 2 failed: Invalid track metadata. Title=${track2.title}, URL=${track2.url}`,
            )
        }

        if (!track2.title.toLowerCase().includes('zoo')) {
            console.warn(
                `⚠ Test 2 warning: Top result title does not contain 'zoo': "${track2.title}"`,
            )
        } else {
            console.log(`✓ Test 2 passed: Found "${track2.title}"`)
        }

        console.log('\n✓ All YouTube smoke tests passed!')
        process.exit(0)
    } catch (error) {
        console.error('\n✗ Smoke test failed:', error)
        process.exit(1)
    } finally {
        try {
            await player.destroy?.()
        } catch {
            // Ignore cleanup errors
        }
    }
}

runYouTubeSmokeTest()
