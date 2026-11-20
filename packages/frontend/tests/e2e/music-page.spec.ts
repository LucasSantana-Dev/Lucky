import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'
import { GUILD_STORAGE, mockMusicState } from './helpers/music-state'

test.describe('Music Page', () => {
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

        await page.goto('/music')
        await page.waitForLoadState('domcontentloaded')

        const prompt = page.locator('text=/Select a server to control music/i')
        await expect(prompt).toBeVisible({ timeout: 5000 })
    })

    test('displays music player heading with guild selected', async ({
        page,
    }) => {
        await mockMusicState(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/music')
        await page.waitForLoadState('domcontentloaded')

        const heading = page
            .getByRole('main')
            .getByText('Music Player', { exact: true })
        await expect(heading).toBeVisible({ timeout: 5000 })
    })

    test('shows connection status badge', async ({ page }) => {
        await mockMusicState(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/music')
        await page.waitForLoadState('domcontentloaded')

        const status = page
            .getByRole('status', { name: /live updates/i })
            .first()
        await expect(status).toBeVisible({ timeout: 5000 })
    })

    test('shows not connected message when no voice channel', async ({
        page,
    }) => {
        await mockMusicState(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/music')
        await page.waitForLoadState('domcontentloaded')

        const notConnected = page.locator(
            'text=/Not connected to a voice channel/i',
        )
        await expect(notConnected).toBeVisible({ timeout: 5000 })
    })
})
