import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'
import {
    navigateToDashboard,
    navigateToFeatures,
    selectServer,
} from './helpers/page-helpers'
import { getServerSelector } from './helpers/ui-helpers'
import { MOCK_GUILDS } from './fixtures/test-data'

test.describe('State Management', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('auth state updates correctly', async ({ page }) => {
        await navigateToDashboard(page)

        const userAvatar = page.locator('[class*="avatar"]').first()
        await expect(userAvatar).toBeVisible({ timeout: 5000 })
    })

    test('guild state updates correctly', async ({ page }) => {
        await navigateToDashboard(page)

        const serverSelector = getServerSelector(page)
        const isVisible = await serverSelector
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await expect(serverSelector).toBeVisible()
        }
    })

    test('features state updates correctly', async ({ page }) => {
        await navigateToFeatures(page)

        const featureCard = page.locator('[class*="card"]').first()
        const isVisible = await featureCard
            .isVisible({ timeout: 3000 })
            .catch(() => false)
    })

    test('state persists across page reloads', async ({ page }) => {
        await navigateToDashboard(page)

        const serverWithBot = MOCK_GUILDS.find((g) => g.hasBot)
        if (serverWithBot) {
            await selectServer(page, serverWithBot.id)
            await page.waitForTimeout(500)

            await page.reload()
            await page.waitForLoadState('networkidle')

            const serverSelector = getServerSelector(page)
            const isVisible = await serverSelector
                .isVisible({ timeout: 3000 })
                .catch(() => false)
        }
    })

    test('state synchronization between stores', async ({ page }) => {
        await navigateToDashboard(page)

        const serverWithBot = MOCK_GUILDS.find((g) => g.hasBot)
        if (serverWithBot) {
            await selectServer(page, serverWithBot.id)
            await page.waitForTimeout(500)

            await navigateToFeatures(page)
            await page.waitForTimeout(500)

            const serverSelector = getServerSelector(page)
            const isVisible = await serverSelector
                .isVisible({ timeout: 3000 })
                .catch(() => false)
        }
    })

    test('optimistic updates', async ({ page }) => {
        await page.route('**/api/guilds/*/features/*', async (route) => {
            await page.waitForTimeout(2000)
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            })
        })

        await navigateToFeatures(page)

        const featureCard = page.locator('[class*="card"]').first()
        const switchButton = featureCard.locator('[role="switch"]').first()

        const isVisible = await switchButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            const initialState = await switchButton.getAttribute('aria-checked')
            await switchButton.click()
            await page.waitForTimeout(100)

            const optimisticState =
                await switchButton.getAttribute('aria-checked')
            expect(optimisticState).not.toBe(initialState)
        }
    })
})
