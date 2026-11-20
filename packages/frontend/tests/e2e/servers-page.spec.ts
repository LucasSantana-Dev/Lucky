import { test, expect } from '@playwright/test'
import { setupMockApiResponses, mockInviteUrl } from './helpers/api-helpers'
import { navigateToServers, waitForServerList } from './helpers/page-helpers'
import {
    getServerCard,
    getAddBotButton,
    getManageButton,
} from './helpers/ui-helpers'
import {
    MOCK_API_RESPONSES,
    MOCK_GUILDS,
    MOCK_DISCORD_USER,
} from './fixtures/test-data'

test.describe('Servers Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('displays user avatar and username', async ({ page }) => {
        await navigateToServers(page)

        const username = page
            .locator('main')
            .getByText(MOCK_DISCORD_USER.username)
        await expect(username.first()).toBeVisible()

        const heading = page.getByRole('heading', { name: 'Servers' }).first()
        await expect(heading).toBeVisible()

        const handle = page
            .locator('main')
            .getByText(`@${MOCK_DISCORD_USER.username}`)
        await expect(handle).toBeVisible()
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

        await expect(serverCard).toContainText(firstServer.name)
    })

    test('displays Bot Added badge for servers with bot', async ({ page }) => {
        await navigateToServers(page)
        await waitForServerList(page)

        for (const guild of MOCK_GUILDS.filter((g) => g.hasBot)) {
            await expect(
                getServerCard(page, guild.name).getByRole('button', {
                    name: /^Manage/,
                }),
            ).toBeVisible()
        }
    })

    test('displays Not Added badge for servers without bot', async ({
        page,
    }) => {
        await navigateToServers(page)
        await waitForServerList(page)

        for (const guild of MOCK_GUILDS.filter((g) => !g.hasBot)) {
            await expect(
                getServerCard(page, guild.name).getByRole('button', {
                    name: /^Add bot/i,
                }),
            ).toBeVisible()
        }
    })

    test('Manage button navigates to dashboard for servers with bot', async ({
        page,
    }) => {
        await navigateToServers(page)
        await waitForServerList(page)

        // The first bot server is auto-selected, so manage the last one to
        // prove the click is what changes the active server.
        const serverWithBot = MOCK_GUILDS.filter((g) => g.hasBot).at(-1)!
        const manageButton = getManageButton(page, serverWithBot.name)
        await expect(manageButton).toBeVisible()
        await manageButton.click()

        await expect(page).toHaveURL(/\/$/)
        await expect(
            page.getByRole('button', {
                name: `Active server: ${serverWithBot.name}. Click to switch.`,
            }),
        ).toBeVisible()
    })

    test('Add Bot button functionality for servers without bot', async ({
        page,
    }) => {
        await mockInviteUrl(page, '222222222222222222')
        await page.route('https://discord.com/**', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'text/html',
                body: '<html><body>invite</body></html>',
            }),
        )
        await navigateToServers(page)
        await waitForServerList(page)

        const serverWithoutBot = MOCK_GUILDS.find((g) => !g.hasBot)!
        const addBotButton = getAddBotButton(page, serverWithoutBot.name)
        await expect(addBotButton).toBeVisible()

        const [popup] = await Promise.all([
            page.waitForEvent('popup'),
            addBotButton.click(),
        ])
        await popup.waitForURL(MOCK_API_RESPONSES.inviteUrl.inviteUrl)
        await popup.close()
    })

    test('shows loading skeleton during data fetch', async ({ page }) => {
        let release!: () => void
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        await page.route('**/api/guilds', async (route) => {
            await gate
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(MOCK_API_RESPONSES.guildsList),
            })
        })

        await navigateToServers(page)

        await expect(page.locator('main .animate-pulse').first()).toBeVisible()

        release()
        await waitForServerList(page)
        await expect(page.locator('main .animate-pulse')).toHaveCount(0)
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

        const emptyState = page.getByText(/No servers yet/)
        await expect(emptyState).toBeVisible()
    })

    test('shows a retry action when the guild list request fails', async ({
        page,
    }) => {
        await page.route('**/api/guilds', async (route) => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Internal server error' }),
            })
        })

        await navigateToServers(page)
        await waitForServerList(page)

        await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
        for (const guild of MOCK_GUILDS) {
            await expect(getServerCard(page, guild.name)).toHaveCount(0)
        }
    })

    test('displays server count correctly', async ({ page }) => {
        await navigateToServers(page)
        await waitForServerList(page)

        const withBot = MOCK_GUILDS.filter((g) => g.hasBot).length
        await expect(
            page
                .locator('main')
                .getByText(
                    `${MOCK_GUILDS.length} servers — ${withBot} with Lucky installed`,
                ),
        ).toBeVisible()
    })
})
