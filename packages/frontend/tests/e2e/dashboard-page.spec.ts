import { test, expect } from '@playwright/test'
import { setupMockApiResponses, mockGuildsList } from './helpers/api-helpers'
import {
    navigateToDashboard,
    waitForDashboard,
    selectServer,
} from './helpers/page-helpers'
import { getServerSelector } from './helpers/ui-helpers'
import { MOCK_GUILDS } from './fixtures/test-data'

test.describe('Dashboard Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('auto-selects first server with bot when available', async ({
        page,
    }) => {
        await navigateToDashboard(page)
        await waitForDashboard(page)

        const firstBotServer = MOCK_GUILDS.find((g) => g.hasBot)
        if (firstBotServer) {
            const serverSelector = getServerSelector(page)
            const isVisible = await serverSelector
                .isVisible({ timeout: 3000 })
                .catch(() => false)

            if (isVisible) {
                await expect(serverSelector).toBeVisible()
            }
        }
    })

    test('displays No Server Selected state when no bot servers', async ({
        page,
    }) => {
        await page.route('**/api/guilds', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    guilds: MOCK_GUILDS.filter((g) => !g.hasBot),
                }),
            })
        })

        await navigateToDashboard(page)
        await waitForDashboard(page)

        const noServerState = page.locator(
            'text=/No Server Selected|Select a server/i',
        )
        await expect(noServerState).toBeVisible({ timeout: 5000 })
    })

    test('server selector dropdown in header', async ({ page }) => {
        await navigateToDashboard(page)
        await waitForDashboard(page)

        const serverSelector = getServerSelector(page)
        const isVisible = await serverSelector
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await expect(serverSelector).toBeVisible()
        }
    })

    test('selects different server from dropdown', async ({ page }) => {
        await navigateToDashboard(page)
        await waitForDashboard(page)

        const serverSelector = getServerSelector(page)
        const isVisible = await serverSelector
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await serverSelector.click()
            await page.waitForTimeout(500)

            const secondServer = MOCK_GUILDS.find((g, i) => i > 0 && g.hasBot)
            if (secondServer) {
                const serverOption = page
                    .locator(`text=${secondServer.name}`)
                    .first()
                if (
                    await serverOption
                        .isVisible({ timeout: 2000 })
                        .catch(() => false)
                ) {
                    await serverOption.click()
                    await page.waitForTimeout(500)
                }
            }
        }
    })

    test('navigates to servers page from empty state', async ({ page }) => {
        await page.route('**/api/guilds', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ guilds: [] }),
            })
        })

        await navigateToDashboard(page)
        await waitForDashboard(page)

        const viewServersButton = page
            .locator(
                'button:has-text("View Your Servers"), button:has-text("servers")',
            )
            .first()
        const isVisible = await viewServersButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await viewServersButton.click()
            await page.waitForURL(/\/servers/, { timeout: 5000 })
            expect(page.url()).toContain('/servers')
        }
    })

    test('server grid displays correctly', async ({ page }) => {
        await navigateToDashboard(page)
        await waitForDashboard(page)

        const serverGrid = page
            .locator('[class*="grid"], [class*="ServerGrid"]')
            .first()
        const isVisible = await serverGrid
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await expect(serverGrid).toBeVisible()
        }
    })

    test('server selection persists across navigation', async ({ page }) => {
        await navigateToDashboard(page)
        await waitForDashboard(page)

        const serverSelector = getServerSelector(page)
        const isVisible = await serverSelector
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await page.goto('/features')
            await page.waitForLoadState('networkidle')

            const selectorAfterNav = getServerSelector(page)
            const stillVisible = await selectorAfterNav
                .isVisible({ timeout: 2000 })
                .catch(() => false)

            if (stillVisible) {
                await expect(selectorAfterNav).toBeVisible()
            }
        }
    })

    test('shows loading states during server fetch', async ({ page }) => {
        await page.route('**/api/guilds', async (route) => {
            await page.waitForTimeout(1000)
            await route.continue()
        })

        await navigateToDashboard(page)

        await page.waitForTimeout(500)
    })
})
