import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'
import { GUILD_STORAGE, mockMusicState } from './helpers/music-state'

const CTA_NAME = /View discussion on Discord/i

test.describe('Forum thread CTA on the Music page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
        await mockMusicState(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)
    })

    test('shows the CTA when a forum thread is mapped', async ({ page }) => {
        await page.route('**/api/guilds/*/threads/music', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true',
                },
                body: JSON.stringify({
                    threadId: '222222222222222222',
                    slug: 'music',
                    title: 'Music & autoplay',
                    archived: false,
                    url: 'https://discord.com/channels/111111111111111111/222222222222222222',
                }),
            })
        })

        await page.goto('/music')
        await page.waitForLoadState('domcontentloaded')

        const link = page.getByRole('link', { name: CTA_NAME })
        await expect(link).toBeVisible({ timeout: 10000 })
        await expect(link).toHaveAttribute(
            'href',
            'https://discord.com/channels/111111111111111111/222222222222222222',
        )
    })

    test('hides the CTA when no forum thread is mapped (404)', async ({
        page,
    }) => {
        await page.route('**/api/guilds/*/threads/music', async (route) => {
            await route.fulfill({
                status: 404,
                contentType: 'application/json',
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true',
                },
                body: JSON.stringify({ error: 'Thread not found' }),
            })
        })

        await page.goto('/music')
        await page.waitForLoadState('domcontentloaded')

        await expect(
            page
                .locator('#lucky-main-content')
                .getByRole('heading', { name: /Music Player/i }),
        ).toBeVisible({ timeout: 10000 })
        await expect(page.getByRole('link', { name: CTA_NAME })).toHaveCount(0)
    })
})
