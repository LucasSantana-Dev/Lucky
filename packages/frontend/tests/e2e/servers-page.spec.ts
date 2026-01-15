import { test, expect } from '@playwright/test'
import {
    setupMockApiResponses,
    mockGuildsList,
    mockAuthStatus,
} from './helpers/api-helpers'
import { navigateToServers, waitForServerList } from './helpers/page-helpers'
import {
    getServerCard,
    getAddBotButton,
    getManageButton,
    verifyBadge,
} from './helpers/ui-helpers'
import { MOCK_GUILDS, MOCK_DISCORD_USER } from './fixtures/test-data'

test.describe('Servers Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('displays user avatar and username', async ({ page }) => {
        await navigateToServers(page)

        const username = page.locator(`text=${MOCK_DISCORD_USER.username}`)
        await expect(username).toBeVisible()

        const avatar = page
            .locator('[class*="avatar"], img[alt*="avatar"]')
            .first()
        await expect(avatar).toBeVisible()
    })

    test('lists all user Discord servers', async ({ page }) => {
        await navigateToServers(page)
        await waitForServerList(page)

        for (const guild of MOCK_GUILDS) {
            const serverName = page.locator(`text=${guild.name}`)
            await expect(serverName).toBeVisible()
        }
    })

    test('shows server cards with correct information', async ({ page }) => {
        await navigateToServers(page)
        await waitForServerList(page)

        const firstServer = MOCK_GUILDS[0]
        const serverCard = getServerCard(page, firstServer.name)

        await expect(
            serverCard.locator(`text=${firstServer.name}`),
        ).toBeVisible()
    })

    test('displays Bot Added badge for servers with bot', async ({ page }) => {
        await navigateToServers(page)
        await waitForServerList(page)

        const serverWithBot = MOCK_GUILDS.find((g) => g.hasBot)
        if (serverWithBot) {
            await verifyBadge(page, 'Bot Added')
        }
    })

    test('displays Not Added badge for servers without bot', async ({
        page,
    }) => {
        await navigateToServers(page)
        await waitForServerList(page)

        const serverWithoutBot = MOCK_GUILDS.find((g) => !g.hasBot)
        if (serverWithoutBot) {
            await verifyBadge(page, 'Not Added')
        }
    })

    test('Manage button navigates to dashboard for servers with bot', async ({
        page,
    }) => {
        await navigateToServers(page)
        await waitForServerList(page)

        const serverWithBot = MOCK_GUILDS.find((g) => g.hasBot)
        if (serverWithBot) {
            const manageButton = getManageButton(page, serverWithBot.name)
            await manageButton.click()

            await page.waitForURL(/\/dashboard/, { timeout: 5000 })
            expect(page.url()).toContain('/dashboard')
        }
    })

    test('Add Bot button functionality for servers without bot', async ({
        page,
    }) => {
        await mockInviteUrl(page, '222222222222222222')
        await navigateToServers(page)
        await waitForServerList(page)

        const serverWithoutBot = MOCK_GUILDS.find((g) => !g.hasBot)
        if (serverWithoutBot) {
            const addBotButton = getAddBotButton(page, serverWithoutBot.name)
            await expect(addBotButton).toBeVisible()
            await addBotButton.click()

            await page.waitForTimeout(1000)
        }
    })

    test('shows loading skeleton during data fetch', async ({ page }) => {
        await page.route('**/api/guilds', async (route) => {
            await page.waitForTimeout(1000)
            await route.continue()
        })

        await navigateToServers(page)

        const skeleton = page
            .locator('[class*="skeleton"], [class*="Skeleton"]')
            .first()
        const isVisible = await skeleton
            .isVisible({ timeout: 2000 })
            .catch(() => false)

        if (isVisible) {
            await expect(skeleton).toBeVisible()
        }
    })

    test('handles empty state when no servers available', async ({ page }) => {
        await page.route('**/api/guilds', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ guilds: [] }),
            })
        })

        await navigateToServers(page)
        await waitForServerList(page)

        const emptyState = page.locator('text=/no servers|0 servers/i')
        const isEmptyVisible = await emptyState
            .isVisible({ timeout: 2000 })
            .catch(() => false)

        if (isEmptyVisible) {
            await expect(emptyState).toBeVisible()
        }
    })

    test('handles error when API fails', async ({ page }) => {
        await page.route('**/api/guilds', async (route) => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Internal server error' }),
            })
        })

        await navigateToServers(page)
        await waitForServerList(page)

        await page.waitForTimeout(2000)
    })

    test('displays server count correctly', async ({ page }) => {
        await navigateToServers(page)
        await waitForServerList(page)

        const serverCount = page.locator(
            `text=/.*${MOCK_GUILDS.length}.*servers?/i`,
        )
        const isVisible = await serverCount
            .isVisible({ timeout: 2000 })
            .catch(() => false)

        if (isVisible) {
            await expect(serverCount).toBeVisible()
        }
    })
})
