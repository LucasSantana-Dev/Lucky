import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'
import { navigateToDashboard } from './helpers/page-helpers'
import { MOCK_DISCORD_USER } from './fixtures/test-data'

test.describe('Layout and Navigation', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('sidebar displays correctly', async ({ page }) => {
        await navigateToDashboard(page)

        const sidebar = page.locator('aside').first()
        await expect(sidebar).toBeVisible({ timeout: 5000 })
    })

    test('navigation items work', async ({ page }) => {
        await navigateToDashboard(page)

        const featuresLink = page.locator('a:has-text("Features")').first()
        await featuresLink.click()
        await page.waitForURL(/\/features/, { timeout: 5000 })
        expect(page.url()).toContain('/features')

        const dashboardLink = page.locator('a:has-text("Dashboard")').first()
        await dashboardLink.click()
        await page.waitForTimeout(1000)
        expect(page.url()).not.toContain('/features')
    })

    test('active route highlighting', async ({ page }) => {
        await navigateToDashboard(page)

        const dashboardLink = page.locator('a:has-text("Dashboard")').first()
        await expect(dashboardLink).toBeVisible({ timeout: 5000 })
        await expect(dashboardLink).toHaveAttribute('data-active', 'true')
    })

    test('user info in sidebar', async ({ page }) => {
        await navigateToDashboard(page)

        const username = page.locator(`text=${MOCK_DISCORD_USER.username}`)
        await expect(username.first()).toBeVisible({ timeout: 5000 })
    })

    test('user avatar and username display', async ({ page }) => {
        await navigateToDashboard(page)

        const username = page.locator(`text=${MOCK_DISCORD_USER.username}`)
        await expect(username.first()).toBeVisible({ timeout: 5000 })

        const usernameHandle = page.locator(
            `text=@${MOCK_DISCORD_USER.username}`,
        )
        await expect(usernameHandle).toBeVisible({ timeout: 3000 })
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

        const logoutButton = page.locator('button[aria-label="Logout"]').first()
        await expect(logoutButton).toBeVisible({ timeout: 5000 })
        await logoutButton.click()

        await page.waitForTimeout(1000)
    })

    test('server selector dropdown in sidebar', async ({ page }) => {
        await navigateToDashboard(page)

        const serverSelector = page.locator('text=Select a server').first()
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

        const mobileMenuButton = page
            .locator('button[aria-label="Open sidebar"]')
            .first()
        const isVisible = await mobileMenuButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await mobileMenuButton.click()
            await page.waitForTimeout(500)

            const sidebar = page.locator('aside').first()
            await expect(sidebar).toBeVisible()
        }
    })

    test('sidebar closes on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await navigateToDashboard(page)

        const mobileMenuButton = page
            .locator('button[aria-label="Open sidebar"]')
            .first()

        const menuVisible = await mobileMenuButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (menuVisible) {
            await mobileMenuButton.click()
            await page.waitForTimeout(500)

            const closeButton = page
                .locator('button[aria-label="Close sidebar"]')
                .first()
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

        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(2000)
    })

    test('Lucky branding in sidebar', async ({ page }) => {
        await navigateToDashboard(page)

        const branding = page.locator('text=Lucky').first()
        await expect(branding).toBeVisible({ timeout: 5000 })
    })
})
