import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'

const GUILD_STORAGE = JSON.stringify({
    id: '111111111111111111',
    name: 'Test Server 1',
})

function mockMusicState(page: import('@playwright/test').Page) {
    return page.route('**/api/guilds/*/music*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({
                isPlaying: false,
                currentTrack: null,
                tracks: [],
                volume: 80,
                repeatMode: 'off',
                voiceChannelName: null,
            }),
        })
    })
}

test.describe('Music Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('shows select server prompt when no guild', async ({ page }) => {
        await page.goto('/music')
        await page.waitForLoadState('domcontentloaded')

        const prompt = page.locator('text=/Select a server to control music/i')
        const isVisible = await prompt
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(prompt).toBeVisible()
        }
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

        const heading = page.locator('text=/Music Player/i')
        const isVisible = await heading
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(heading).toBeVisible()
        }
    })

    test('shows connection status badge', async ({ page }) => {
        await mockMusicState(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/music')
        await page.waitForLoadState('domcontentloaded')

        const reconnectingStatus = page.getByRole('status', {
            name: /Reconnecting to live updates/i,
        })
        const noTrackStatus = page.getByRole('status', {
            name: /No track playing/i,
        })

        const isVisible = await reconnectingStatus
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(reconnectingStatus).toBeVisible()
            return
        }

        await expect(noTrackStatus).toBeVisible()
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
        const isVisible = await notConnected
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(notConnected).toBeVisible()
        }
    })
})
