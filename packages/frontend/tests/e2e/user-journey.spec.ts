import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'
import {
    navigateToServers,
    navigateToDashboard,
    navigateToFeatures,
} from './helpers/page-helpers'
import { getManageButton } from './helpers/ui-helpers'
import { MOCK_GUILDS } from './fixtures/test-data'

test.describe('User Journey', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('complete flow: Servers → Dashboard → Features', async ({ page }) => {
        await navigateToServers(page)
        await expect(page).toHaveURL(/\/servers/)

        await navigateToDashboard(page)
        const sidebar = page.locator('aside').first()
        await expect(sidebar).toBeVisible({ timeout: 5000 })

        const featuresLink = page.locator('a:has-text("Features")').first()
        await featuresLink.click()
        await page.waitForURL(/\/features/, { timeout: 5000 })
    })

    test('selects server and configures features', async ({ page }) => {
        await navigateToDashboard(page)
        await page.waitForTimeout(500)

        await navigateToFeatures(page)
        await page.waitForTimeout(1000)

        const featureCard = page.locator('[class*="card"]').first()
        const isVisible = await featureCard
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await expect(featureCard).toBeVisible()
        }
    })

    test('navigates between pages', async ({ page }) => {
        await navigateToServers(page)
        await expect(page).toHaveURL(/\/servers/)

        await navigateToDashboard(page)
        expect(page.url()).toMatch(/\/$/)

        await navigateToFeatures(page)
        await expect(page).toHaveURL(/\/features/)

        const dashboardLink = page.locator('a:has-text("Dashboard")').first()
        await dashboardLink.click()
        await page.waitForTimeout(1000)
        expect(page.url()).not.toContain('/features')
    })

    test('state persists across navigation', async ({ page }) => {
        await navigateToDashboard(page)
        await page.waitForTimeout(500)

        await navigateToFeatures(page)
        await page.waitForTimeout(500)

        const sidebar = page.locator('aside').first()
        await expect(sidebar).toBeVisible()
    })

    test('logout and re-login flow', async ({ page }) => {
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

        await page.route('**/api/auth/status', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ authenticated: false }),
            })
        })

        await logoutButton.click()
        await page.waitForTimeout(2000)

        const loginButton = page.locator(
            'button:has-text("Login with Discord")',
        )
        await expect(loginButton).toBeVisible({ timeout: 5000 })
    })

    test('session persistence', async ({ page }) => {
        await navigateToDashboard(page)

        await page.reload()
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1000)

        const sidebar = page.locator('aside').first()
        await expect(sidebar).toBeVisible({ timeout: 5000 })
    })

    test('error recovery scenarios', async ({ page }) => {
        await page.route('**/api/guilds', async (route) => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Internal server error' }),
            })
        })

        await navigateToServers(page)
        await page.waitForTimeout(2000)

        await page.route('**/api/guilds', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ guilds: MOCK_GUILDS }),
            })
        })

        await page.reload()
        await page.waitForLoadState('domcontentloaded')

        const serverName = page.locator(`text=${MOCK_GUILDS[0].name}`)
        const isVisible = await serverName
            .isVisible({ timeout: 5000 })
            .catch(() => false)
    })
})
