import { test, expect } from '@playwright/test'
import { setupMockApiResponses, mockInviteUrl } from './helpers/api-helpers'
import { navigateToServers, waitForServerList } from './helpers/page-helpers'
import {
    getServerCard,
    getAddBotButton,
    getManageButton,
} from './helpers/ui-helpers'
import { MOCK_GUILDS, MOCK_API_RESPONSES } from './fixtures/test-data'

const guildWithoutBot = MOCK_GUILDS.find((guild) => !guild.hasBot)!
const lastGuildWithBot = [...MOCK_GUILDS]
    .reverse()
    .find((guild) => guild.hasBot)!

test.describe('Component Interactions', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('server cards expose the action that matches the bot state', async ({
        page,
    }) => {
        await navigateToServers(page)
        await waitForServerList(page)

        for (const guild of MOCK_GUILDS) {
            await expect(getServerCard(page, guild.name)).toBeVisible()
            await expect(getManageButton(page, guild.name)).toHaveCount(
                guild.hasBot ? 1 : 0,
            )
            await expect(getAddBotButton(page, guild.name)).toHaveCount(
                guild.hasBot ? 0 : 1,
            )
        }
    })

    test('Manage selects the server and opens the dashboard', async ({
        page,
    }) => {
        await navigateToServers(page)
        await waitForServerList(page)

        await getManageButton(page, lastGuildWithBot.name).click()

        await expect(page).toHaveURL(/\/$/)
        await expect(
            page.getByRole('button', {
                name: `Active server: ${lastGuildWithBot.name}. Click to switch.`,
            }),
        ).toBeVisible()
    })

    test('Add Bot requests the invite and opens it in a new tab', async ({
        page,
    }) => {
        await mockInviteUrl(page, guildWithoutBot.id)
        await page
            .context()
            .route('https://discord.com/**', (route) =>
                route.fulfill({ status: 200, body: 'invite' }),
            )
        await navigateToServers(page)
        await waitForServerList(page)

        const [popup, inviteRequest] = await Promise.all([
            page.waitForEvent('popup'),
            page.waitForRequest(`**/api/guilds/${guildWithoutBot.id}/invite`),
            getAddBotButton(page, guildWithoutBot.name).click(),
        ])

        expect(inviteRequest.method()).toBe('GET')
        await popup.waitForURL(MOCK_API_RESPONSES.inviteUrl.inviteUrl)
        expect(popup.url()).toBe(MOCK_API_RESPONSES.inviteUrl.inviteUrl)
    })

    test('Add Bot shows an error toast when the invite fails', async ({
        page,
    }) => {
        await page.route(
            `**/api/guilds/${guildWithoutBot.id}/invite`,
            (route) =>
                route.fulfill({
                    status: 500,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'boom' }),
                }),
        )
        await navigateToServers(page)
        await waitForServerList(page)

        await getAddBotButton(page, guildWithoutBot.name).click()

        await expect(
            page.getByText('Failed to generate invite URL'),
        ).toBeVisible()
    })

    test('shows loading placeholders until the server list arrives', async ({
        page,
    }) => {
        let release: () => void = () => {}
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

        await expect(page.locator('.animate-pulse').first()).toBeVisible({
            timeout: 10000,
        })
        await expect(getManageButton(page, MOCK_GUILDS[0].name)).toHaveCount(0)

        release()

        await expect(getManageButton(page, MOCK_GUILDS[0].name)).toBeVisible()
        await expect(page.locator('.animate-pulse')).toHaveCount(0)
    })
})
