import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from '../helpers/api-helpers'
import {
    navigateToServers,
    navigateToDashboard,
    navigateToFeatures,
    toggleFeature,
} from '../helpers/page-helpers'
import { MOCK_FEATURES } from '../fixtures/test-data'

test.describe('Page Performance', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('servers page load time', async ({ page }) => {
        const startTime = Date.now()

        await navigateToServers(page)
        await page.waitForLoadState('networkidle')

        const endTime = Date.now()
        const loadTime = endTime - startTime

        expect(loadTime).toBeLessThan(3000)
    })

    test('dashboard page load time', async ({ page }) => {
        const startTime = Date.now()

        await navigateToDashboard(page)
        await page.waitForLoadState('networkidle')

        const endTime = Date.now()
        const loadTime = endTime - startTime

        expect(loadTime).toBeLessThan(3000)
    })

    test('features page load time', async ({ page }) => {
        const startTime = Date.now()

        await navigateToFeatures(page)
        await page.waitForLoadState('networkidle')

        const endTime = Date.now()
        const loadTime = endTime - startTime

        expect(loadTime).toBeLessThan(3000)
    })

    test('server switching performance', async ({ page }) => {
        await navigateToDashboard(page)

        const startTime = Date.now()

        const serverSelector = page
            .locator('button:has([class*="avatar"])')
            .first()
        const isVisible = await serverSelector
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await serverSelector.click()
            await page.waitForTimeout(500)
        }

        const endTime = Date.now()
        const switchTime = endTime - startTime

        expect(switchTime).toBeLessThan(2000)
    })

    test('feature toggle performance', async ({ page }) => {
        await navigateToFeatures(page)

        const firstFeature = MOCK_FEATURES[0]
        const featureCard = page.locator('[class*="card"]').first()
        const switchButton = featureCard.locator('[role="switch"]').first()

        const isVisible = await switchButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            const startTime = Date.now()
            await switchButton.click()
            await page.waitForTimeout(500)
            const endTime = Date.now()
            const toggleTime = endTime - startTime

            expect(toggleTime).toBeLessThan(1000)
        }
    })

    test('navigation performance', async ({ page }) => {
        await navigateToServers(page)

        const startTime = Date.now()

        const dashboardLink = page
            .locator('button:has-text("Dashboard")')
            .first()
        await dashboardLink.click()
        await page.waitForURL(/\/dashboard/, { timeout: 5000 })

        const endTime = Date.now()
        const navTime = endTime - startTime

        expect(navTime).toBeLessThan(2000)
    })

    test('API response time', async ({ page }) => {
        const startTime = Date.now()

        const response = await page.waitForResponse(
            (response) =>
                response.url().includes('/api/guilds') &&
                response.status() === 200,
            { timeout: 5000 },
        )

        const endTime = Date.now()
        const responseTime = endTime - startTime

        expect(response.status()).toBe(200)
        expect(responseTime).toBeLessThan(2000)
    })

    test('rendering performance', async ({ page }) => {
        await page.goto('/servers')

        const startTime = Date.now()
        await page.waitForLoadState('networkidle')
        const endTime = Date.now()

        const renderTime = endTime - startTime
        expect(renderTime).toBeLessThan(3000)
    })
})
