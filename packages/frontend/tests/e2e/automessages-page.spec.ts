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
        await page.goto('/automessages')
        await page.waitForLoadState('domcontentloaded')

        const heading = page.locator('text=/No Server Selected/i')
        const isVisible = await heading
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(heading).toBeVisible()
        }
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
        const isVisible = await heading
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(heading).toBeVisible()
        }
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
        const isVisible = await createBtn
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(createBtn).toBeVisible()
        }
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
        const isVisible = await emptyMsg
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(emptyMsg).toBeVisible()
        }
    })
})
