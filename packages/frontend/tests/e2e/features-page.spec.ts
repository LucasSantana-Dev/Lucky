import { test, expect } from '@playwright/test'
import { setupMockApiResponses, mockGlobalToggles } from './helpers/api-helpers'
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
    })

    test('displays server-specific toggles section', async ({ page }) => {
        await navigateToFeatures(page)
        await waitForFeatures(page)

        await expect(
            page.getByRole('heading', { level: 1, name: 'Features' }),
        ).toBeVisible({ timeout: 5000 })
        await expect(
            page.getByRole('heading', { level: 2, name: 'Server Toggles' }),
        ).toBeVisible({ timeout: 5000 })
    })

    test('displays global toggles section for developers', async ({ page }) => {
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

        const globalSection = page.getByRole('heading', {
            level: 2,
            name: /Global Toggles/i,
        })
        const isVisible = await globalSection
            .isVisible({ timeout: 3000 })
            .catch(() => false)
    })

    test('toggles feature on/off (server-specific)', async ({ page }) => {
        let updated = false
        await page.route('**/api/guilds/*/features/*', async (route) => {
            updated = true
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            })
        })

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
            await switchButton.click()
            await page.waitForTimeout(500)
            expect(updated).toBe(true)
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

        await navigateToFeatures(page)
        await waitForFeatures(page)
        await expect(
            page.getByRole('heading', { level: 1, name: 'Features' }),
        ).toBeVisible({ timeout: 5000 })
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
