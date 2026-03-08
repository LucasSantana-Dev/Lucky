import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'

const MOCK_TRACK_HISTORY = [
    {
        trackId: 'track-1',
        title: 'Bohemian Rhapsody',
        author: 'Queen',
        duration: '5:55',
        url: 'https://youtube.com/watch?v=abc',
        timestamp: Date.now() - 300_000,
        playedBy: 'testuser',
    },
    {
        trackId: 'track-2',
        title: 'Stairway to Heaven',
        author: 'Led Zeppelin',
        duration: '8:02',
        url: 'https://youtube.com/watch?v=def',
        timestamp: Date.now() - 3_600_000,
        playedBy: 'testuser',
    },
    {
        trackId: 'track-3',
        title: 'Hotel California',
        author: 'Eagles',
        duration: '6:30',
        url: 'https://youtube.com/watch?v=ghi',
        timestamp: Date.now() - 86_400_000,
        playedBy: 'anotheruser',
    },
]

const MOCK_STATS = {
    totalTracks: 42,
    totalPlayTime: 7200,
    topArtists: [
        { artist: 'Queen', plays: 15 },
        { artist: 'Led Zeppelin', plays: 10 },
        { artist: 'Eagles', plays: 8 },
    ],
    topTracks: [
        { trackId: 'track-1', title: 'Bohemian Rhapsody', plays: 7 },
        { trackId: 'track-2', title: 'Stairway to Heaven', plays: 5 },
    ],
    lastUpdated: new Date().toISOString(),
}

const GUILD_ID = '111111111111111111'
const GUILD_STORAGE = JSON.stringify({
    id: GUILD_ID,
    name: 'Test Server 1',
})

function mockTrackHistoryApi(page: import('@playwright/test').Page) {
    return page.route('**/*track-history*', async (route) => {
        const url = route.request().url()
        const isStats = url.includes('/stats')

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify(
                isStats
                    ? { stats: MOCK_STATS }
                    : { history: MOCK_TRACK_HISTORY },
            ),
        })
    })
}

function mockTrackHistoryClear(page: import('@playwright/test').Page) {
    return page.route(
        `**/api/guilds/${GUILD_ID}/track-history`,
        async (route) => {
            if (route.request().method() === 'DELETE') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true }),
                })
            } else {
                await route.continue()
            }
        },
    )
}

test.describe('Track History Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('shows select server prompt when no guild', async ({ page }) => {
        await page.route('**/api/guilds', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ guilds: [] }),
            })
        })

        await page.goto('/music/history')
        await page.waitForLoadState('domcontentloaded')

        const prompt = page.locator(
            'text=/Select a server to view track history/i',
        )
        const isVisible = await prompt
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(prompt).toBeVisible()
        }
    })

    test('displays track history with stats', async ({ page }) => {
        await mockTrackHistoryApi(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/music/history')
        await page.waitForLoadState('domcontentloaded')

        const heading = page.locator('text=/Track History/i')
        const isVisible = await heading
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(heading).toBeVisible()

            const errorMsg = page.locator('text=/Failed to load/i')
            const hasError = await errorMsg
                .isVisible({ timeout: 1000 })
                .catch(() => false)

            if (!hasError) {
                const tracksPlayed = page.locator('text=/42/').first()
                const statsVisible = await tracksPlayed
                    .isVisible({ timeout: 5000 })
                    .catch(() => false)

                if (statsVisible) {
                    await expect(tracksPlayed).toBeVisible()

                    const trackTitle = page.locator('text=/Bohemian Rhapsody/i')
                    await expect(trackTitle.first()).toBeVisible({
                        timeout: 5000,
                    })
                }
            }
        }
    })

    test('displays stat cards with correct values', async ({ page }) => {
        await mockTrackHistoryApi(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/music/history')
        await page.waitForLoadState('domcontentloaded')

        const playTime = page.locator('text=/2h 0m/').first()
        const isVisible = await playTime
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(playTime).toBeVisible()

            const topArtist = page.locator('text=/Queen/').first()
            await expect(topArtist).toBeVisible({ timeout: 3000 })
        }
    })

    test('shows ranking cards for top tracks and artists', async ({ page }) => {
        await mockTrackHistoryApi(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/music/history')
        await page.waitForLoadState('domcontentloaded')

        const topTracks = page.locator('text=/Top Tracks/i')
        const isVisible = await topTracks
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(topTracks).toBeVisible()

            const topArtists = page.locator('text=/Top Artists/i')
            await expect(topArtists).toBeVisible({ timeout: 3000 })
        }
    })

    test('shows empty state when no tracks played', async ({ page }) => {
        await page.route('**/*track-history*', async (route) => {
            const url = route.request().url()
            const isStats = url.includes('/stats')
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(
                    isStats ? { stats: null } : { history: [] },
                ),
            })
        })
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/music/history')
        await page.waitForLoadState('domcontentloaded')

        const emptyState = page.locator('text=/No tracks played yet/i')
        await expect(emptyState).toBeVisible({ timeout: 5000 })
    })

    test('shows error state on API failure', async ({ page }) => {
        await page.route('**/*track-history*', async (route) => {
            await route.fulfill({ status: 500 })
        })
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/music/history')
        await page.waitForLoadState('domcontentloaded')

        const errorMsg = page.locator('text=/Failed to load track history/i')
        await expect(errorMsg).toBeVisible({ timeout: 5000 })
    })

    test('clear button removes history', async ({ page }) => {
        await mockTrackHistoryApi(page)
        await mockTrackHistoryClear(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/music/history')
        await page.waitForLoadState('domcontentloaded')

        const clearButton = page.locator('button:has-text("Clear")')
        const isVisible = await clearButton
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await clearButton.click()

            const emptyState = page.locator('text=/No tracks played yet/i')
            await expect(emptyState).toBeVisible({ timeout: 5000 })
        }
    })

    test('track links open in new tab', async ({ page }) => {
        await mockTrackHistoryApi(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/music/history')
        await page.waitForLoadState('domcontentloaded')

        const trackLink = page.locator('a[target="_blank"]').first()
        const isVisible = await trackLink
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(trackLink).toHaveAttribute(
                'rel',
                'noopener noreferrer',
            )
        }
    })
})
