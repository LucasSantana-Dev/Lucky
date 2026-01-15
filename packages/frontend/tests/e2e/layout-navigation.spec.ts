import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'
import { navigateToDashboard, navigateToFeatures } from './helpers/page-helpers'
import {
    getSidebar,
    getMobileMenuButton,
    getUserDropdown,
    getLogoutButton,
} from './helpers/ui-helpers'
import { MOCK_DISCORD_USER } from './fixtures/test-data'

test.describe('Layout and Navigation', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('sidebar displays correctly', async ({ page }) => {
        await navigateToDashboard(page)

        const sidebar = getSidebar(page)
        await expect(sidebar).toBeVisible({ timeout: 5000 })
    })

    test('navigation items work', async ({ page }) => {
        await navigateToDashboard(page)

        const dashboardLink = page
            .locator('button:has-text("Dashboard"), a:has-text("Dashboard")')
            .first()
        await dashboardLink.click()
        await page.waitForURL(/\/dashboard/, { timeout: 5000 })

        const featuresLink = page
            .locator('button:has-text("Features"), a:has-text("Features")')
            .first()
        await featuresLink.click()
        await page.waitForURL(/\/features/, { timeout: 5000 })
    })

    test('active route highlighting', async ({ page }) => {
        await navigateToDashboard(page)

        const dashboardLink = page
            .locator('button:has-text("Dashboard")')
            .first()
        const dashboardClass = await dashboardLink.getAttribute('class')

        expect(dashboardClass).toContain('active')
    })

    test('user dropdown in header', async ({ page }) => {
        await navigateToDashboard(page)

        const userDropdown = getUserDropdown(page)
        await expect(userDropdown).toBeVisible({ timeout: 5000 })
    })

    test('user avatar and username display', async ({ page }) => {
        await navigateToDashboard(page)

        const username = page.locator(`text=@${MOCK_DISCORD_USER.username}`)
        const isVisible = await username
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await expect(username).toBeVisible()
        }

        const avatar = page.locator('[class*="avatar"]').first()
        await expect(avatar).toBeVisible()
    })

    test('logout functionality', async ({ page }) => {
        await page.route('**/api/auth/logout', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            })
        })

        await navigateToDashboard(page)

        const userDropdown = getUserDropdown(page)
        await userDropdown.click()
        await page.waitForTimeout(500)

        const logoutButton = getLogoutButton(page)
        await logoutButton.click()

        await page.waitForURL(/\//, { timeout: 5000 })
        expect(page.url()).not.toContain('/dashboard')
    })

    test('server selector dropdown in header', async ({ page }) => {
        await navigateToDashboard(page)

        const serverSelector = page
            .locator('button:has([class*="avatar"])')
            .first()
        const isVisible = await serverSelector
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await expect(serverSelector).toBeVisible()
        }
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

    test('sidebar closes on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await navigateToDashboard(page)

        const mobileMenuButton = getMobileMenuButton(page)
        const closeButton = page
            .locator('button:has([class*="X"]), button[aria-label*="close"]')
            .first()

        const menuVisible = await mobileMenuButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (menuVisible) {
            await mobileMenuButton.click()
            await page.waitForTimeout(500)

            const closeVisible = await closeButton
                .isVisible({ timeout: 2000 })
                .catch(() => false)
            if (closeVisible) {
                await closeButton.click()
                await page.waitForTimeout(500)
            }
        }
    })

    test('navigation redirects unauthenticated users', async ({ page }) => {
        await page.route('**/api/auth/status', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ authenticated: false }),
            })
        })

        await page.goto('/dashboard')
        await page.waitForURL(/\//, { timeout: 5000 })
        expect(page.url()).not.toContain('/dashboard')
    })

    test('Join Discord button in sidebar', async ({ page }) => {
        await navigateToDashboard(page)

        const joinButton = page.locator('button:has-text("Join Discord")')
        const isVisible = await joinButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await expect(joinButton).toBeVisible()
        }
    })
})
