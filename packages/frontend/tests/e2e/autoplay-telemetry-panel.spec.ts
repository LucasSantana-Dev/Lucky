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

function mockRecommendationHistory(
    page: import('@playwright/test').Page,
    perSource: unknown[],
) {
    return page.route(
        '**/api/guilds/*/recommendations/history**',
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true',
                },
                body: JSON.stringify({
                    summary: {
                        totalPicks: 40,
                        accepted: 30,
                        rejected: 10,
                        pending: 0,
                        globalAcceptanceRate: 0.75,
                    },
                    perSource,
                }),
            })
        },
    )
}

test.describe('Autoplay telemetry panel on the Music page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
        await mockMusicState(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)
    })

    test('renders the per-source acceptance table', async ({ page }) => {
        await mockRecommendationHistory(page, [
            {
                source: 'youtube',
                count: 25,
                acceptedCount: 20,
                rejectedCount: 5,
                pendingCount: 0,
                acceptanceRate: 0.8,
            },
            {
                source: 'spotify',
                count: 15,
                acceptedCount: 10,
                rejectedCount: 5,
                pendingCount: 0,
                acceptanceRate: 0.67,
            },
        ])

        await page.goto('/music')
        await page.waitForLoadState('domcontentloaded')

        const panel = page
            .getByText('Autoplay acceptance', { exact: false })
            .locator('xpath=ancestor::*[contains(@class, "surface-card")]')
        await expect(panel).toBeVisible({ timeout: 10000 })
        await expect(panel.getByText('youtube', { exact: true })).toBeVisible()
        await expect(panel.getByText('spotify', { exact: true })).toBeVisible()
        await expect(panel.getByText('80%', { exact: true })).toBeVisible()
        await expect(
            panel.getByText(/30 of 40 picks accepted overall/i),
        ).toBeVisible()
    })

    test('shows the empty state when there is no history', async ({ page }) => {
        await mockRecommendationHistory(page, [])

        await page.goto('/music')
        await page.waitForLoadState('domcontentloaded')

        await expect(page.getByText('No autoplay history yet')).toBeVisible({
            timeout: 10000,
        })
    })
})
