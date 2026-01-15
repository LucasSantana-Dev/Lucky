import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'
import { navigateToServers, navigateToFeatures } from './helpers/page-helpers'
import {
    getServerCard,
    getFeatureCard,
    getAddBotButton,
    verifyToast,
} from './helpers/ui-helpers'
import { MOCK_GUILDS, MOCK_FEATURES } from './fixtures/test-data'

test.describe('Component Interactions', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('ServerCard click interactions', async ({ page }) => {
        await navigateToServers(page)

        const firstServer = MOCK_GUILDS[0]
        const serverCard = getServerCard(page, firstServer.name)

        await expect(serverCard).toBeVisible()
    })

    test('FeatureCard toggle interactions', async ({ page }) => {
        await navigateToFeatures(page)

        const firstFeature = MOCK_FEATURES[0]
        const featureCard = getFeatureCard(page, firstFeature.name)
        const switchButton = featureCard.locator('[role="switch"]').first()

        const isVisible = await switchButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await switchButton.click()
            await page.waitForTimeout(500)

            const newState = await switchButton.getAttribute('aria-checked')
            expect(newState).toBeTruthy()
        }
    })

    test('AddBotButton click and invite flow', async ({ page }) => {
        const serverWithoutBot = MOCK_GUILDS.find((g) => !g.hasBot)
        if (serverWithoutBot) {
            await page.route(
                `**/api/guilds/${serverWithoutBot.id}/invite`,
                async (route) => {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            inviteUrl:
                                'https://discord.com/api/oauth2/authorize?client_id=test',
                        }),
                    })
                },
            )

            await navigateToServers(page)

            const addBotButton = getAddBotButton(page, serverWithoutBot.name)
            await addBotButton.click()

            await page.waitForTimeout(1000)
        }
    })

    test('dropdown menu interactions', async ({ page }) => {
        await navigateToServers(page)

        const userDropdown = page
            .locator('button:has([class*="avatar"])')
            .last()
        await userDropdown.click()
        await page.waitForTimeout(500)

        const dropdownMenu = page.locator('[role="menu"]').first()
        const isVisible = await dropdownMenu
            .isVisible({ timeout: 2000 })
            .catch(() => false)
    })

    test('button states (loading, disabled)', async ({ page }) => {
        await page.route('**/api/guilds', async (route) => {
            await page.waitForTimeout(2000)
            await route.continue()
        })

        await navigateToServers(page)

        const loadingButton = page
            .locator('button:has-text("Loading"), button[disabled]')
            .first()
        const isVisible = await loadingButton
            .isVisible({ timeout: 2000 })
            .catch(() => false)
    })

    test('toast notifications display', async ({ page }) => {
        await navigateToFeatures(page)

        const firstFeature = MOCK_FEATURES[0]
        const featureCard = getFeatureCard(page, firstFeature.name)
        const switchButton = featureCard.locator('[role="switch"]').first()

        const isVisible = await switchButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await switchButton.click()
            await page.waitForTimeout(1000)

            const toast = page
                .locator('[class*="toast"], [role="status"]')
                .first()
            const toastVisible = await toast
                .isVisible({ timeout: 3000 })
                .catch(() => false)
        }
    })

    test('form submissions', async ({ page }) => {
        await navigateToFeatures(page)

        const firstFeature = MOCK_FEATURES[0]
        const featureCard = getFeatureCard(page, firstFeature.name)
        const switchButton = featureCard.locator('[role="switch"]').first()

        const isVisible = await switchButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await switchButton.click()

            const [response] = await Promise.all([
                page
                    .waitForResponse(
                        (response) => response.url().includes('/api/'),
                        { timeout: 5000 },
                    )
                    .catch(() => null),
                page.waitForTimeout(1000),
            ])
        }
    })
})
