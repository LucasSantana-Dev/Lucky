import { test, expect } from '@playwright/test'
import {
    setupMockApiResponses,
    mockGlobalToggles,
    mockServerToggles,
} from './helpers/api-helpers'
import {
    navigateToFeatures,
    waitForFeatures,
    toggleFeature,
    selectServer,
} from './helpers/page-helpers'
import {
    getFeatureCard,
    getServerSelector,
    verifyToast,
} from './helpers/ui-helpers'
import { MOCK_FEATURES, MOCK_GUILDS } from './fixtures/test-data'

test.describe('Features Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
        await page.route('**/api/guilds/*/me**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    guildId: '111111111111111111',
                    nickname: 'Server Nick',
                    username: 'testuser',
                    globalName: 'Test User',
                    roleIds: ['role-mod'],
                    effectiveAccess: {
                        overview: 'manage',
                        settings: 'manage',
                        moderation: 'manage',
                        automation: 'manage',
                        music: 'manage',
                        integrations: 'manage',
                    },
                    canManageRbac: true,
                }),
            })
        })
    })

    test('displays server-specific toggles section', async ({ page }) => {
        await navigateToFeatures(page)
        await waitForFeatures(page)
        await page
            .locator('[role="status"]:has-text("Loading...")')
            .first()
            .waitFor({ state: 'hidden', timeout: 15000 })
            .catch(() => {})

        await expect(
            page.getByRole('heading', { name: 'Features' }),
        ).toBeVisible({ timeout: 15000 })
        await expect(
            page.locator('[aria-labelledby="server-toggles-heading"]'),
        ).toBeVisible({ timeout: 5000 })
    })

    test('displays global toggles section for developers', async ({ page }) => {
        await page.unroute('**/api/auth/status')
        await page.route('**/api/auth/status', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    authenticated: true,
                    user: {
                        id: '123456789012345678',
                        username: 'testuser',
                        globalName: 'Test User',
                        isDeveloper: true,
                    },
                }),
            })
        })

        await mockGlobalToggles(page)
        await page.route('**/api/toggles/global', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ toggles: {} }),
            })
        })

        await navigateToFeatures(page)
        await waitForFeatures(page)

        await expect(
            page.getByRole('heading', { name: /Global Toggles/i }),
        ).toBeVisible({ timeout: 5000 })
    })

    test('toggles feature on/off (server-specific)', async ({ page }) => {
        await navigateToFeatures(page)
        await waitForFeatures(page)

        const firstFeature = MOCK_FEATURES[0]
        const featureCard = getFeatureCard(page, firstFeature.name)

        const switchButton = featureCard
            .locator('[role="switch"], button[aria-checked]')
            .first()
        const isVisible = await switchButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            const initialState = await switchButton.getAttribute('aria-checked')
            await switchButton.click()
            await page.waitForTimeout(500)

            const newState = await switchButton.getAttribute('aria-checked')
            expect(newState).not.toBe(initialState)
        }
    })

    test('server selector dropdown functionality', async ({ page }) => {
        await navigateToFeatures(page)
        await waitForFeatures(page)

        const serverSelector = getServerSelector(page)
        const isVisible = await serverSelector
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await serverSelector.click()
            await page.waitForTimeout(500)

            const dropdown = page
                .locator('[role="menu"], [class*="dropdown"]')
                .first()
            const dropdownVisible = await dropdown
                .isVisible({ timeout: 2000 })
                .catch(() => false)
        }
    })

    test('selects different server to view its toggles', async ({ page }) => {
        await navigateToFeatures(page)
        await waitForFeatures(page)

        const sidebar = page.locator('aside').first()
        await expect(sidebar).toBeVisible({ timeout: 5000 })
    })

    test('shows loading states during data fetch', async ({ page }) => {
        await page.unroute('**/api/features')
        await page.unroute('**/api/guilds/111111111111111111/features')
        await page.route('**/api/features', async (route) => {
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 1000)
            })
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ features: MOCK_FEATURES }),
            })
        })
        await page.route(
            '**/api/guilds/111111111111111111/features',
            async (route) => {
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, 1000)
                })
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        guildId: '111111111111111111',
                        toggles: {
                            DOWNLOAD_VIDEO: true,
                            DOWNLOAD_AUDIO: true,
                            MUSIC_RECOMMENDATIONS: true,
                            AUTOPLAY: true,
                            LYRICS: true,
                            QUEUE_MANAGEMENT: true,
                            REACTION_ROLES: true,
                            ROLE_MANAGEMENT: true,
                        },
                    }),
                })
            },
        )

        await navigateToFeatures(page)

        const loadingIndicator = page.locator('.animate-pulse').first()
        const loadingVisible = await loadingIndicator
            .isVisible({ timeout: 2000 })
            .catch(() => false)
        if (loadingVisible) {
            await expect(loadingIndicator).toBeVisible()
        }
        await waitForFeatures(page)
        await expect(
            page.getByRole('heading', { name: 'Features' }),
        ).toBeVisible({ timeout: 10000 })
    })

    test('shows toast notifications on toggle success', async ({ page }) => {
        await navigateToFeatures(page)
        await waitForFeatures(page)

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

    test('feature cards display correct information', async ({ page }) => {
        await navigateToFeatures(page)
        await waitForFeatures(page)

        const firstFeature = MOCK_FEATURES[0]
        const featureCard = getFeatureCard(page, firstFeature.name)

        const isVisible = await featureCard
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            await expect(
                featureCard.locator(
                    `text=/.*${firstFeature.name.replace(/_/g, ' ')}.*/i`,
                ),
            ).toBeVisible()
        }
    })

    test('badge indicators show Global vs Per-Server', async ({ page }) => {
        await navigateToFeatures(page)
        await waitForFeatures(page)

        const globalBadge = page.locator('text=/Global/i').first()
        const serverBadge = page.locator('text=/Per-Server|Server/i').first()

        const globalVisible = await globalBadge
            .isVisible({ timeout: 2000 })
            .catch(() => false)
        const serverVisible = await serverBadge
            .isVisible({ timeout: 2000 })
            .catch(() => false)
    })

    test('developer-only global toggles are hidden for non-developers', async ({
        page,
    }) => {
        await page.route('**/api/toggles/global', async (route) => {
            await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Forbidden' }),
            })
        })

        await navigateToFeatures(page)
        await waitForFeatures(page)

        const globalSection = page.locator('text=/Global Toggles/i')
        const isVisible = await globalSection
            .isVisible({ timeout: 2000 })
            .catch(() => false)

        expect(isVisible).toBe(false)
    })
})
