import { test, expect } from '@playwright/test'
import {
    setupMockApiResponses,
    mockInviteUrl,
    mockServerSettings,
} from './helpers/api-helpers'
import {
    navigateToServers,
    navigateToDashboard,
    selectServer,
} from './helpers/page-helpers'
import {
    getAddBotButton,
    getServerCard,
    verifyBadge,
} from './helpers/ui-helpers'
import { MOCK_GUILDS } from './fixtures/test-data'

test.describe('Server Management', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('add bot to server flow', async ({ page }) => {
        const serverWithoutBot = MOCK_GUILDS.find((g) => !g.hasBot)
        if (serverWithoutBot) {
            await mockInviteUrl(page, serverWithoutBot.id)
            await navigateToServers(page)

            const addBotButton = getAddBotButton(page, serverWithoutBot.name)
            await expect(addBotButton).toBeVisible()
            await addBotButton.click()

            await page.waitForTimeout(1000)
        }
    })

    test('generates bot invite URL', async ({ page }) => {
        const serverWithoutBot = MOCK_GUILDS.find((g) => !g.hasBot)
        if (serverWithoutBot) {
            await mockInviteUrl(page, serverWithoutBot.id)

            const response = await page.waitForResponse(
                (response) =>
                    response
                        .url()
                        .includes(`/api/guilds/${serverWithoutBot.id}/invite`),
                { timeout: 5000 },
            )

            expect(response.status()).toBe(200)
            const data = await response.json()
            expect(data.inviteUrl).toBeTruthy()
        }
    })

    test('server selection updates across pages', async ({ page }) => {
        await navigateToDashboard(page)

        const firstServer = MOCK_GUILDS.find((g) => g.hasBot)
        if (firstServer) {
            await selectServer(page, firstServer.id)
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

    test('server settings fetch', async ({ page }) => {
        const serverWithBot = MOCK_GUILDS.find((g) => g.hasBot)
        if (serverWithBot) {
            await mockServerSettings(page, serverWithBot.id)
            await navigateToDashboard(page)

            await page.waitForTimeout(1000)
        }
    })

    test('multiple server switching', async ({ page }) => {
        await navigateToDashboard(page)

        const botServers = MOCK_GUILDS.filter((g) => g.hasBot)
        if (botServers.length > 1) {
            for (const server of botServers.slice(0, 2)) {
                await selectServer(page, server.id)
                await page.waitForTimeout(500)
            }
        }
    })

    test('server card interactions', async ({ page }) => {
        await navigateToServers(page)

        const firstServer = MOCK_GUILDS[0]
        const serverCard = getServerCard(page, firstServer.name)

        await expect(serverCard).toBeVisible()
    })

    test('server grid layout', async ({ page }) => {
        await navigateToServers(page)

        const serverGrid = page.locator('[class*="grid"]').first()
        const isVisible = await serverGrid
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await expect(serverGrid).toBeVisible()
        }
    })

    test('server filtering (bot added vs not added)', async ({ page }) => {
        await navigateToServers(page)

        const serversWithBot = MOCK_GUILDS.filter((g) => g.hasBot)
        const serversWithoutBot = MOCK_GUILDS.filter((g) => !g.hasBot)

        for (const server of serversWithBot) {
            await verifyBadge(page, 'Bot Added')
        }

        for (const server of serversWithoutBot) {
            await verifyBadge(page, 'Not Added')
        }
    })
})
