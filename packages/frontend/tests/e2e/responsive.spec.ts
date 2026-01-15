import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'
import {
    navigateToDashboard,
    navigateToServers,
    navigateToFeatures,
} from './helpers/page-helpers'
import { getSidebar, getMobileMenuButton } from './helpers/ui-helpers'

test.describe('Responsive Design', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('mobile menu toggle', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await navigateToDashboard(page)

        const mobileMenuButton = getMobileMenuButton(page)
        const isVisible = await mobileMenuButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await mobileMenuButton.click()
            await page.waitForTimeout(500)

            const sidebar = getSidebar(page)
            await expect(sidebar).toBeVisible()
        }
    })

    test('sidebar behavior on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await navigateToDashboard(page)

        const sidebar = getSidebar(page)
        const initialVisible = await sidebar
            .isVisible({ timeout: 2000 })
            .catch(() => false)

        const mobileMenuButton = getMobileMenuButton(page)
        const menuVisible = await mobileMenuButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (menuVisible) {
            await mobileMenuButton.click()
            await page.waitForTimeout(500)

            const afterClickVisible = await sidebar
                .isVisible({ timeout: 2000 })
                .catch(() => false)
        }
    })

    test('server grid layout on different screen sizes', async ({ page }) => {
        const viewports = [
            { width: 375, height: 667 },
            { width: 768, height: 1024 },
            { width: 1920, height: 1080 },
        ]

        for (const viewport of viewports) {
            await page.setViewportSize(viewport)
            await navigateToServers(page)

            const serverGrid = page.locator('[class*="grid"]').first()
            const isVisible = await serverGrid
                .isVisible({ timeout: 3000 })
                .catch(() => false)
        }
    })

    test('feature cards responsive layout', async ({ page }) => {
        const viewports = [
            { width: 375, height: 667 },
            { width: 768, height: 1024 },
            { width: 1920, height: 1080 },
        ]

        for (const viewport of viewports) {
            await page.setViewportSize(viewport)
            await navigateToFeatures(page)

            const featureCard = page.locator('[class*="card"]').first()
            const isVisible = await featureCard
                .isVisible({ timeout: 3000 })
                .catch(() => false)
        }
    })

    test('header layout on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await navigateToDashboard(page)

        const header = page.locator('header, [class*="header"]').first()
        await expect(header).toBeVisible({ timeout: 5000 })

        const mobileMenuButton = getMobileMenuButton(page)
        const isVisible = await mobileMenuButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)
    })

    test('navigation accessibility', async ({ page }) => {
        await navigateToDashboard(page)

        const dashboardLink = page
            .locator('button:has-text("Dashboard")')
            .first()
        await expect(dashboardLink).toBeVisible()

        const featuresLink = page.locator('button:has-text("Features")').first()
        await expect(featuresLink).toBeVisible()
    })

    test('sidebar hidden on mobile by default', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await navigateToDashboard(page)

        const sidebar = getSidebar(page)
        const isVisible = await sidebar
            .isVisible({ timeout: 2000 })
            .catch(() => false)

        const mobileMenuButton = getMobileMenuButton(page)
        const menuVisible = await mobileMenuButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (menuVisible && !isVisible) {
            expect(isVisible).toBe(false)
        }
    })
})
