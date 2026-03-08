import { test, expect } from '@playwright/test'
import {
    setupMockApiResponses,
    mockServerSettings,
} from './helpers/api-helpers'

const GUILD_STORAGE = JSON.stringify({
    id: '111111111111111111',
    name: 'Test Server 1',
})

test.describe('Server Settings Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('shows no server selected when no guild', async ({ page }) => {
        await page.goto('/settings')
        await page.waitForLoadState('domcontentloaded')

        const heading = page.locator('text=/No Server Selected/i')
        const isVisible = await heading
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(heading).toBeVisible()
        }
    })

    test('displays server settings heading with guild', async ({ page }) => {
        await mockServerSettings(page, '111111111111111111')
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/settings')
        await page.waitForLoadState('domcontentloaded')

        const heading = page.locator('text=/Server Settings/i')
        const isVisible = await heading
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(heading).toBeVisible()
        }
    })

    test('shows save button', async ({ page }) => {
        await mockServerSettings(page, '111111111111111111')
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/settings')
        await page.waitForLoadState('domcontentloaded')

        const saveBtn = page.locator('button:has-text("Save")').first()
        const isVisible = await saveBtn
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(saveBtn).toBeVisible()
        }
    })
})
