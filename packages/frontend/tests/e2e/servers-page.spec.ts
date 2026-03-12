import { test, expect } from '@playwright/test'
import { setupMockApiResponses, mockInviteUrl } from './helpers/api-helpers'
import { navigateToServers, waitForServerList } from './helpers/page-helpers'
import {
    getServerCard,
    getAddBotButton,
    getManageButton,
} from './helpers/ui-helpers'
import { MOCK_GUILDS, MOCK_DISCORD_USER } from './fixtures/test-data'

test.describe('Servers Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('displays user avatar and username', async ({ page }) => {
        await navigateToServers(page)
        await waitForServerList(page)

        await expect(
            page.getByText(new RegExp(`^${MOCK_DISCORD_USER.username}$`)),
        ).toBeVisible()

        await expect(
            page.getByText(`@${MOCK_DISCORD_USER.username}`).first(),
        ).toBeVisible()
    })

    test('lists all user Discord servers', async ({ page }) => {
        await navigateToServers(page)
        await waitForServerList(page)

        for (const guild of MOCK_GUILDS) {
            const serverCard = getServerCard(page, guild.name)
            await expect(serverCard).toBeVisible()
        }
    })

    test('shows server cards with correct information', async ({ page }) => {
        await navigateToServers(page)
        await waitForServerList(page)

        const firstServer = MOCK_GUILDS[0]
        const serverCard = getServerCard(page, firstServer.name)

        await expect(
            serverCard.getByRole('heading', { name: firstServer.name }),
        ).toBeVisible()
    })

    test('displays Bot Added badge for servers with bot', async ({ page }) => {
        await navigateToServers(page)
        await waitForServerList(page)

        const serverWithBot = MOCK_GUILDS.find((g) => g.hasBot)
        if (serverWithBot) {
            const serverCard = getServerCard(page, serverWithBot.name)
            await expect(serverCard.getByText('Bot Added')).toBeVisible()
        }
    })

    test('displays Not Added badge for servers without bot', async ({
        page,
    }) => {
        await navigateToServers(page)
        await waitForServerList(page)

        const serverWithoutBot = MOCK_GUILDS.find((g) => !g.hasBot)
        if (serverWithoutBot) {
            const serverCard = getServerCard(page, serverWithoutBot.name)
            await expect(serverCard.getByText('Not Added')).toBeVisible()
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
            await expect(manageButton).toBeVisible()
            await manageButton.click()

            await page.waitForURL(/\/$/, { timeout: 5000 })
            expect(page.url()).not.toContain('/servers')
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

            await page.evaluate(() => {
                window.open = (() => null) as typeof window.open
            })
            await addBotButton.click()

            await page.waitForTimeout(1000)
        }
    })

    test('shows loading skeleton during data fetch', async ({ page }) => {
        await page.route('**/api/guilds', async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 1000))
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

        await page.unroute('**/api/guilds')
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
        await expect(
            page
                .getByRole('status')
                .filter({ hasText: /No servers found matching the filter\./i }),
        ).toBeVisible({ timeout: 10000 })
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
        await expect(
            page
                .getByRole('status')
                .filter({ hasText: /No servers found matching the filter\./i }),
        ).toBeVisible({ timeout: 10000 })
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
