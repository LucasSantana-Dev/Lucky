import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from '../helpers/api-helpers'
import {
    navigateToServers,
    navigateToDashboard,
    navigateToFeatures,
} from '../helpers/page-helpers'

test.describe('Visual Regression - Pages', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('servers page screenshot', async ({ page }) => {
        await navigateToServers(page)
        await page.waitForLoadState('networkidle')

        await expect(page).toHaveScreenshot('servers-page.png', {
            fullPage: true,
            maxDiffPixels: 100,
        })
    })

    test('dashboard page screenshot', async ({ page }) => {
        await navigateToDashboard(page)
        await page.waitForLoadState('networkidle')

        await expect(page).toHaveScreenshot('dashboard-page.png', {
            fullPage: true,
            maxDiffPixels: 100,
        })
    })

    test('features page screenshot', async ({ page }) => {
        await navigateToFeatures(page)
        await page.waitForLoadState('networkidle')

        await expect(page).toHaveScreenshot('features-page.png', {
            fullPage: true,
            maxDiffPixels: 100,
        })
    })

    test('layout components screenshots', async ({ page }) => {
        await navigateToDashboard(page)
        await page.waitForLoadState('networkidle')

        const sidebar = page.locator('aside').first()
        await expect(sidebar).toHaveScreenshot('sidebar.png', {
            maxDiffPixels: 50,
        })

        const header = page.locator('header').first()
        await expect(header).toHaveScreenshot('header.png', {
            maxDiffPixels: 50,
        })
    })

    test('error state screenshots', async ({ page }) => {
        await page.route('**/api/guilds', async (route) => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Internal server error' }),
            })
        })

        await navigateToServers(page)
        await page.waitForTimeout(2000)

        await expect(page).toHaveScreenshot('servers-page-error.png', {
            fullPage: true,
            maxDiffPixels: 100,
        })
    })

    test('loading state screenshots', async ({ page }) => {
        await page.route('**/api/guilds', async (route) => {
            await page.waitForTimeout(2000)
            await route.continue()
        })

        await navigateToServers(page)
        await page.waitForTimeout(500)

        await expect(page).toHaveScreenshot('servers-page-loading.png', {
            fullPage: true,
            maxDiffPixels: 100,
        })
    })
})
