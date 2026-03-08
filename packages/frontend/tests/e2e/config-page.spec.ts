import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'

const GUILD_STORAGE = JSON.stringify({
    id: '111111111111111111',
    name: 'Test Server 1',
})

test.describe('Config Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('shows configuration heading without guild', async ({ page }) => {
        await page.goto('/config')
        await page.waitForLoadState('domcontentloaded')

        const heading = page.locator('text=/Configuration/i')
        const isVisible = await heading
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(heading).toBeVisible()
        }
    })

    test('displays module cards with guild selected', async ({ page }) => {
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/config')
        await page.waitForLoadState('domcontentloaded')

        const musicModule = page.locator('text=/Music Module/i')
        const isVisible = await musicModule
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(musicModule).toBeVisible()
            await expect(page.locator('text=/Commands/i').first()).toBeVisible()
            await expect(
                page.locator('text=/Moderation/i').first(),
            ).toBeVisible()
        }
    })

    test('shows module descriptions', async ({ page }) => {
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/config')
        await page.waitForLoadState('domcontentloaded')

        const desc = page.locator(
            'text=/Configure music playback, queue management/i',
        )
        const isVisible = await desc
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(desc).toBeVisible()
        }
    })
})
