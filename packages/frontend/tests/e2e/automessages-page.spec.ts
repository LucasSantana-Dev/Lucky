import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'

const GUILD_STORAGE = JSON.stringify({
    id: '111111111111111111',
    name: 'Test Server 1',
})

test.describe('Auto Messages Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('shows no server selected when no guild', async ({ page }) => {
        await page.route('**/api/guilds', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ guilds: [] }),
            })
        })

        await page.goto('/automessages')
        await page.waitForLoadState('domcontentloaded')

        const heading = page.locator('text=/No Server Selected/i')
        await expect(heading).toBeVisible({ timeout: 5000 })
    })

    test('displays auto messages heading with guild', async ({ page }) => {
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/automessages')
        await page.waitForLoadState('domcontentloaded')

        const heading = page.getByRole('heading', {
            name: 'Auto Messages',
            exact: true,
        })
        await expect(heading).toBeVisible({ timeout: 5000 })
    })

    test('shows create button with guild selected', async ({ page }) => {
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/automessages')
        await page.waitForLoadState('domcontentloaded')

        const createBtn = page
            .locator('button:has-text("Create"), button:has-text("New")')
            .first()
        await expect(createBtn).toBeVisible({ timeout: 5000 })
    })

    test('shows empty state when no messages configured', async ({ page }) => {
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/automessages')
        await page.waitForLoadState('domcontentloaded')

        const emptyMsg = page.locator(
            'text=/No auto messages|no messages configured/i',
        )
        await expect(emptyMsg).toBeVisible({ timeout: 5000 })
    })
})
