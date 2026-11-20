import { test, expect } from '@playwright/test'
import { setupMockApiResponses, mockInviteUrl } from './helpers/api-helpers'
import {
    navigateToServers,
    navigateToDashboard,
    navigateToFeatures,
} from './helpers/page-helpers'
import {
    getAddBotButton,
    getServerCard,
    getServerSelector,
    verifyBadge,
} from './helpers/ui-helpers'
import { MOCK_API_RESPONSES, MOCK_GUILDS } from './fixtures/test-data'

const SERVER_WITHOUT_BOT = MOCK_GUILDS.find((g) => !g.hasBot)!
const SERVER_WITH_BOT = MOCK_GUILDS.find((g) => g.hasBot)!

test.describe('Server Management', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('add bot to server flow opens the generated invite URL', async ({
        page,
    }) => {
        await mockInviteUrl(page, SERVER_WITHOUT_BOT.id)
        await navigateToServers(page)

        const addBotButton = getAddBotButton(page, SERVER_WITHOUT_BOT.name)
        await expect(addBotButton).toBeVisible()

        const [popup] = await Promise.all([
            page.waitForEvent('popup'),
            addBotButton.click(),
        ])
        expect(popup.url()).toBe(MOCK_API_RESPONSES.inviteUrl.inviteUrl)
        await popup.close()
    })

    test('server selection persists across pages', async ({ page }) => {
        await navigateToDashboard(page)
        const chip = getServerSelector(page)
        await expect(chip).toHaveAccessibleName(
            `Active server: ${SERVER_WITH_BOT.name}. Click to switch.`,
        )

        await navigateToFeatures(page)

        await expect(chip).toHaveAccessibleName(
            `Active server: ${SERVER_WITH_BOT.name}. Click to switch.`,
        )
        await expect(page.locator('aside').first()).toBeVisible()
    })

    test('server settings are fetched for the active server', async ({
        page,
    }) => {
        const settingsRequest = page.waitForRequest((request) =>
            request
                .url()
                .endsWith(`/api/guilds/${SERVER_WITH_BOT.id}/settings`),
        )

        await page.goto('/settings')

        await settingsRequest
        await expect(
            page.getByText(`General configuration for ${SERVER_WITH_BOT.name}`),
        ).toBeVisible()
    })

    test('server card is visible', async ({ page }) => {
        await navigateToServers(page)

        const serverCard = getServerCard(page, MOCK_GUILDS[0].name)

        await expect(serverCard).toBeVisible()
    })

    test('server grid lists every guild', async ({ page }) => {
        await navigateToServers(page)

        for (const guild of MOCK_GUILDS) {
            await expect(getServerCard(page, guild.name)).toBeVisible()
        }
    })

    test('server filtering (bot added vs not added)', async ({ page }) => {
        await navigateToServers(page)

        await verifyBadge(page, 'Lucky installed')
        await verifyBadge(page, 'Add Bot')
    })
})
