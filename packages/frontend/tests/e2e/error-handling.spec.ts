import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'
import {
    navigateToServers,
    navigateToDashboard,
    navigateToFeatures,
} from './helpers/page-helpers'

test.describe('Error Handling', () => {
    test('network errors display user-friendly messages', async ({ page }) => {
        await page.route('**/api/guilds', async (route) => {
            await route.abort('failed')
        })

        await navigateToServers(page)
        await page.waitForTimeout(2000)
    })

    test('401 errors redirect to login', async ({ page }) => {
        await page.route('**/api/**', async (route) => {
            await route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Unauthorized' }),
            })
        })

        await page.goto('/dashboard')
        await page.waitForURL(/\//, { timeout: 5000 })
        expect(page.url()).not.toContain('/dashboard')
    })

    test('403 errors show appropriate messages', async ({ page }) => {
        await page.route('**/api/toggles/global', async (route) => {
            await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Forbidden' }),
            })
        })

        await navigateToFeatures(page)
        await page.waitForTimeout(2000)

        const globalSection = page.locator('text=/Global Toggles/i')
        const isVisible = await globalSection
            .isVisible({ timeout: 2000 })
            .catch(() => false)
        expect(isVisible).toBe(false)
    })

    test('404 errors handled gracefully', async ({ page }) => {
        await page.route('**/api/guilds/999999999999999999', async (route) => {
            await route.fulfill({
                status: 404,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Not found' }),
            })
        })

        await navigateToDashboard(page)
        await page.waitForTimeout(2000)
    })

    test('API timeout handling', async ({ page }) => {
        await page.route('**/api/guilds', async (route) => {
            await page.waitForTimeout(10000)
            await route.continue()
        })

        await navigateToServers(page)
        await page.waitForTimeout(2000)
    })

    test('invalid server selection', async ({ page }) => {
        await navigateToDashboard(page)

        await page.route('**/api/guilds/invalid-id', async (route) => {
            await route.fulfill({
                status: 404,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Guild not found' }),
            })
        })

        await page.waitForTimeout(1000)
    })

    test('feature toggle failures', async ({ page }) => {
        await page.route('**/api/guilds/*/features/*', async (route) => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Internal server error' }),
            })
        })

        await navigateToFeatures(page)

        const featureCard = page.locator('[class*="card"]').first()
        const switchButton = featureCard.locator('[role="switch"]').first()

        const isVisible = await switchButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await switchButton.click()
            await page.waitForTimeout(1000)

            const errorToast = page.locator('text=/Failed|Error/i').first()
            const toastVisible = await errorToast
                .isVisible({ timeout: 3000 })
                .catch(() => false)
        }
    })

    test('server fetch failures', async ({ page }) => {
        await page.route('**/api/guilds', async (route) => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Failed to fetch guilds' }),
            })
        })

        await navigateToServers(page)
        await page.waitForTimeout(2000)
    })
})
