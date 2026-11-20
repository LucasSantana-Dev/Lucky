import { test, expect, type Page } from '@playwright/test'
import {
    setupMockApiResponses,
    mockServerSettings,
} from './helpers/api-helpers'
import { MOCK_GUILDS } from './fixtures/test-data'

const GUILD_ID = '111111111111111111'
const GUILD_STORAGE = JSON.stringify({
    id: GUILD_ID,
    name: 'Test Server 1',
})

async function mockNoBotGuilds(page: Page): Promise<void> {
    await page.route('**/api/guilds', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                guilds: MOCK_GUILDS.filter((g) => !g.hasBot),
            }),
        })
    })
}

test.describe('Server Settings Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('shows no server selected when no server has the bot', async ({
        page,
    }) => {
        await mockNoBotGuilds(page)
        await page.goto('/settings')

        await expect(
            page.getByRole('heading', { name: 'No Server Selected' }),
        ).toBeVisible()
        await expect(
            page.getByRole('button', { name: 'Save Changes' }),
        ).toHaveCount(0)
    })

    test('displays server settings heading with guild', async ({ page }) => {
        await mockServerSettings(page, GUILD_ID)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/settings')

        await expect(
            page.getByRole('heading', { name: 'Server Settings' }),
        ).toBeVisible()
        await expect(
            page.getByText('General configuration for Test Server 1'),
        ).toBeVisible()
    })

    test('shows save button', async ({ page }) => {
        await mockServerSettings(page, GUILD_ID)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/settings')

        await expect(
            page.getByRole('button', { name: 'Save Changes' }).first(),
        ).toBeVisible()
    })
})
