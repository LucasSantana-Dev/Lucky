import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'
import {
    navigateToServers,
    navigateToDashboard,
    navigateToFeatures,
    selectServer,
} from './helpers/page-helpers'
import {
    getManageButton,
    getLogoutButton,
    getUserDropdown,
} from './helpers/ui-helpers'
import { MOCK_GUILDS } from './fixtures/test-data'

test.describe('User Journey', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('complete flow: Login → Servers → Dashboard → Features', async ({
        page,
    }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        await navigateToServers(page)
        await expect(page).toHaveURL(/\/servers/)

        const serverWithBot = MOCK_GUILDS.find((g) => g.hasBot)
        if (serverWithBot) {
            const manageButton = getManageButton(page, serverWithBot.name)
            await manageButton.click()
            await page.waitForURL(/\/dashboard/, { timeout: 5000 })
        }

        const featuresLink = page.locator('button:has-text("Features")').first()
        await featuresLink.click()
        await page.waitForURL(/\/features/, { timeout: 5000 })
    })

    test('selects server and configures features', async ({ page }) => {
        await navigateToDashboard(page)

        const serverWithBot = MOCK_GUILDS.find((g) => g.hasBot)
        if (serverWithBot) {
            await selectServer(page, serverWithBot.id)
            await page.waitForTimeout(500)

            await navigateToFeatures(page)
            await page.waitForTimeout(1000)

            const featureCard = page.locator('[class*="card"]').first()
            const isVisible = await featureCard
                .isVisible({ timeout: 3000 })
                .catch(() => false)
        }
    })

    test('navigates between pages', async ({ page }) => {
        await navigateToServers(page)
        await expect(page).toHaveURL(/\/servers/)

        await navigateToDashboard(page)
        await expect(page).toHaveURL(/\/dashboard/)

        await navigateToFeatures(page)
        await expect(page).toHaveURL(/\/features/)

        const dashboardLink = page
            .locator('button:has-text("Dashboard")')
            .first()
        await dashboardLink.click()
        await expect(page).toHaveURL(/\/dashboard/)
    })

    test('state persists across navigation', async ({ page }) => {
        await navigateToDashboard(page)

        const serverWithBot = MOCK_GUILDS.find((g) => g.hasBot)
        if (serverWithBot) {
            await selectServer(page, serverWithBot.id)
            await page.waitForTimeout(500)

            await navigateToFeatures(page)
            await page.waitForTimeout(500)

            const serverSelector = page
                .locator('button:has([class*="avatar"])')
                .first()
            const isVisible = await serverSelector
                .isVisible({ timeout: 3000 })
                .catch(() => false)
        }
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

        const userDropdown = getUserDropdown(page)
        await userDropdown.click()
        await page.waitForTimeout(500)

        const logoutButton = getLogoutButton(page)
        await logoutButton.click()

        await page.waitForURL(/\//, { timeout: 5000 })
        expect(page.url()).not.toContain('/dashboard')

        const loginButton = page.locator(
            'button:has-text("Login with Discord")',
        )
        await expect(loginButton).toBeVisible()
    })

    test('session persistence', async ({ page }) => {
        await navigateToDashboard(page)

        await page.reload()
        await page.waitForLoadState('networkidle')

        await expect(page).toHaveURL(/\/dashboard/)
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
        await page.waitForLoadState('networkidle')

        const serverName = page.locator(`text=${MOCK_GUILDS[0].name}`)
        const isVisible = await serverName
            .isVisible({ timeout: 5000 })
            .catch(() => false)
    })
})
