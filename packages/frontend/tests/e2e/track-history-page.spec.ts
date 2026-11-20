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

async function waitForAppLoaderToSettle(page: import('@playwright/test').Page) {
    await page
        .locator('[role="status"]:has-text("Loading...")')
        .first()
        .waitFor({ state: 'hidden', timeout: 20000 })
        .catch(() => {})
}

function mockTrackHistoryApi(page: import('@playwright/test').Page) {
    return page.route('**/api/guilds/*/music/history**', async (route) => {
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
    return page.route('**/api/guilds/*/music/history', async (route) => {
        if (route.request().method() === 'DELETE') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            })
            return
        }
        await route.continue()
    })
}

test.describe('Track History Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
        await page.route('**/api/guilds/*/me**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    guildId: GUILD_ID,
                    nickname: 'Server Nick',
                    username: 'testuser',
                    globalName: 'Test User',
                    roleIds: ['role-mod'],
                    effectiveAccess: {
                        overview: 'manage',
                        settings: 'manage',
                        moderation: 'manage',
                        automation: 'manage',
                        music: 'manage',
                        integrations: 'manage',
                    },
                    canManageRbac: true,
                }),
            })
        })
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

        await expect(
            page.getByText('Select a server to view track history'),
        ).toBeVisible({ timeout: 10000 })
    })

    test('displays track history with stats', async ({ page }) => {
        await mockTrackHistoryApi(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/music/history')
        await page.waitForLoadState('domcontentloaded')

        await expect(
            page.getByRole('heading', { name: /Track History/i }),
        ).toBeVisible({ timeout: 10000 })
        await expect(page.getByText('Failed to load')).toHaveCount(0)
        await expect(page.getByText('42').first()).toBeVisible({
            timeout: 5000,
        })
        await expect(page.getByText('Bohemian Rhapsody').first()).toBeVisible({
            timeout: 5000,
        })
    })

    test('displays stat cards with correct values', async ({ page }) => {
        await mockTrackHistoryApi(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/music/history')
        await page.waitForLoadState('domcontentloaded')

        await expect(page.getByText('2h 0m').first()).toBeVisible({
            timeout: 10000,
        })
        await expect(page.getByText('Queen').first()).toBeVisible({
            timeout: 3000,
        })
    })

    test('shows ranking cards for top tracks and artists', async ({ page }) => {
        await mockTrackHistoryApi(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/music/history')
        await page.waitForLoadState('domcontentloaded')

        await expect(page.getByText('Top Tracks', { exact: true })).toBeVisible(
            {
                timeout: 10000,
            },
        )
        await expect(
            page.getByText('Top Artists', { exact: true }),
        ).toBeVisible({ timeout: 3000 })
    })

    test('shows empty state when no tracks played', async ({ page }) => {
        await page.route('**/api/guilds/*/music/history**', async (route) => {
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
        await waitForAppLoaderToSettle(page)

        await expect(page.getByText('No tracks played yet')).toBeVisible({
            timeout: 10000,
        })
    })

    test('shows error state on API failure', async ({ page }) => {
        await page.route('**/api/guilds/*/music/history**', async (route) => {
            await route.fulfill({ status: 500 })
        })
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/music/history')
        await page.waitForLoadState('domcontentloaded')
        await waitForAppLoaderToSettle(page)

        await expect(
            page.getByText('Failed to load track history'),
        ).toBeVisible({ timeout: 10000 })
    })

    test('clear button removes history after confirmation', async ({
        page,
    }) => {
        await mockTrackHistoryApi(page)
        await mockTrackHistoryClear(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/music/history')
        await page.waitForLoadState('domcontentloaded')

        await page.getByRole('button', { name: 'Clear', exact: true }).click()

        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible({ timeout: 5000 })
        await expect(dialog.getByText('Clear track history?')).toBeVisible()

        const deleteRequest = page.waitForRequest(
            (req) =>
                req.method() === 'DELETE' &&
                /\/music\/history$/.test(req.url()),
        )
        await dialog.getByRole('button', { name: 'Clear', exact: true }).click()
        await deleteRequest

        await expect(page.getByText('No tracks played yet')).toBeVisible({
            timeout: 5000,
        })
    })

    test('track links open in new tab', async ({ page }) => {
        await mockTrackHistoryApi(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/music/history')
        await page.waitForLoadState('domcontentloaded')

        const trackLink = page.locator('a[target="_blank"]').first()
        await expect(trackLink).toBeVisible({ timeout: 10000 })
        await expect(trackLink).toHaveAttribute('rel', 'noopener noreferrer')
    })
})
