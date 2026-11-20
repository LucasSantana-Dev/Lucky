import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'
import { navigateToDashboard } from './helpers/page-helpers'
import { getServerSelector } from './helpers/ui-helpers'
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

    test('user info in header', async ({ page }) => {
        await navigateToDashboard(page)
        // The header shows the Discord global name (nickname only with a member context).
        const profileName = page.getByText(MOCK_DISCORD_USER.globalName)
        await expect(profileName.first()).toBeVisible({ timeout: 5000 })
    })

    test('user avatar and username display', async ({ page }) => {
        await navigateToDashboard(page)

        const profileName = page.getByText(MOCK_DISCORD_USER.globalName)
        await expect(profileName.first()).toBeVisible({ timeout: 5000 })
        const initials = MOCK_DISCORD_USER.username
            .substring(0, 2)
            .toUpperCase()
        await expect(
            page.getByText(initials, { exact: true }).first(),
        ).toBeVisible({ timeout: 3000 })
    })

    test('logout functionality', async ({ page }) => {
        let logoutCalled = false
        await page.route('**/api/auth/logout', async (route) => {
            logoutCalled = true
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            })
        })

        await navigateToDashboard(page)

        const logoutButton = page
            .getByRole('button', { name: 'Log out' })
            .first()
        await expect(logoutButton).toBeVisible({ timeout: 5000 })
        await logoutButton.click()

        await expect.poll(() => logoutCalled).toBe(true)
    })

    test('server selector chip in header', async ({ page }) => {
        await navigateToDashboard(page)

        await expect(getServerSelector(page)).toHaveAccessibleName(
            /^Active server: Test Server 1\./,
        )
    })

    test('mobile menu toggle', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await navigateToDashboard(page)

        const mobileSidebar = page.locator('#mobile-sidebar')
        await expect(mobileSidebar).toHaveCount(0)

        const toggle = page.getByRole('button', {
            name: 'Open navigation menu',
        })
        await expect(toggle).toHaveAttribute('aria-expanded', 'false')
        await toggle.click()

        await expect(mobileSidebar).toBeVisible()
        await expect(toggle).toHaveAttribute('aria-expanded', 'true')
        await expect(
            mobileSidebar.getByRole('link', { name: 'Features' }),
        ).toBeVisible()
    })

    test('sidebar closes on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await navigateToDashboard(page)

        await page.getByRole('button', { name: 'Open navigation menu' }).click()
        const mobileSidebar = page.locator('#mobile-sidebar')
        await expect(mobileSidebar).toBeVisible()

        // Tap the backdrop to the right of the 256px drawer.
        await page.mouse.click(340, 400)
        await expect(mobileSidebar).toHaveCount(0)
    })

    test('navigation redirects unauthenticated users', async ({ page }) => {
        await page.route('**/api/auth/status', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ authenticated: false }),
            })
        })

        await page.goto('/features')

        await expect(page).toHaveURL(/\/$/)
        await expect(page.locator('aside')).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(
            0,
        )
    })

    test('Lucky branding in sidebar', async ({ page }) => {
        await navigateToDashboard(page)

        await expect(page).toHaveTitle(/Lucky/)
    })
})
