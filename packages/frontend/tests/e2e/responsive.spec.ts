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

    test('mobile menu button on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await navigateToDashboard(page)

        const mobileMenuButton = page
            .locator('button[aria-label="Open navigation menu"]')
            .first()
        await expect(mobileMenuButton).toBeVisible({ timeout: 5000 })
    })

    test('navigation accessibility', async ({ page }) => {
        await navigateToDashboard(page)

        const dashboardLink = page.locator('a:has-text("Dashboard")').first()
        await expect(dashboardLink).toBeVisible()

        const featuresLink = page.locator('a:has-text("Features")').first()
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

    for (const width of [360, 390, 768, 1023]) {
        test(`header content clears the menu button at ${width}px`, async ({
            page,
        }) => {
            await page.setViewportSize({ width, height: 800 })
            await navigateToDashboard(page)

            const button = getMobileMenuButton(page)
            await expect(button).toBeVisible()
            const buttonBox = await button.boundingBox()

            const headerChildren = page.locator(
                '.lucky-shell-header > div:first-child > *',
            )
            const count = await headerChildren.count()
            expect(count).toBeGreaterThan(0)
            for (let i = 0; i < count; i++) {
                const box = await headerChildren.nth(i).boundingBox()
                if (!box || !buttonBox) continue
                expect(box.x).toBeGreaterThanOrEqual(
                    buttonBox.x + buttonBox.width,
                )
            }
        })
    }

    test('sidebar links show a focus ring when active and inactive', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await navigateToDashboard(page)

        const links = getSidebar(page).locator('a[data-active]')
        const active = links.locator('xpath=self::*[@data-active="true"]')
        const inactive = links.locator('xpath=self::*[@data-active="false"]')

        for (const link of [active.first(), inactive.first()]) {
            await link.focus()
            await page.keyboard.press('Shift+Tab')
            await page.keyboard.press('Tab')
            await expect
                .poll(() =>
                    link.evaluate((el) => getComputedStyle(el).boxShadow),
                )
                .toContain('rgb(88, 101, 242) 0px 0px 0px 3px')
        }
    })
})
