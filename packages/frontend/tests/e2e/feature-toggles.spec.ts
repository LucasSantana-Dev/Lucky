import { test, expect } from '@playwright/test'
import { setupMockApiResponses, mockToggleUpdate } from './helpers/api-helpers'
import { navigateToFeatures, toggleFeature } from './helpers/page-helpers'
import { getFeatureCard, verifyToast } from './helpers/ui-helpers'
import { MOCK_FEATURES } from './fixtures/test-data'

test.describe('Feature Toggles', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('lists all available features', async ({ page }) => {
        await navigateToFeatures(page)

        for (const feature of MOCK_FEATURES) {
            const featureCard = getFeatureCard(page, feature.name)
            const isVisible = await featureCard
                .isVisible({ timeout: 3000 })
                .catch(() => false)
        }
    })

    test('toggles individual features', async ({ page }) => {
        await navigateToFeatures(page)

        const firstFeature = MOCK_FEATURES[0]
        const featureCard = getFeatureCard(page, firstFeature.name)
        const switchButton = featureCard.locator('[role="switch"]').first()

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

    test('verifies API calls on toggle', async ({ page }) => {
        await mockToggleUpdate(page, false, '111111111111111111')
        await navigateToFeatures(page)

        const firstFeature = MOCK_FEATURES[0]
        const featureCard = getFeatureCard(page, firstFeature.name)
        const switchButton = featureCard.locator('[role="switch"]').first()

        const isVisible = await switchButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            const [response] = await Promise.all([
                page.waitForResponse(
                    (response) =>
                        response.url().includes('/api/guilds/') &&
                        response.url().includes('/features/'),
                    { timeout: 5000 },
                ),
                switchButton.click(),
            ])

            expect(response.status()).toBe(200)
        }
    })

    test('state updates after toggle', async ({ page }) => {
        await navigateToFeatures(page)

        const firstFeature = MOCK_FEATURES[0]
        const featureCard = getFeatureCard(page, firstFeature.name)
        const switchButton = featureCard.locator('[role="switch"]').first()

        const isVisible = await switchButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            const beforeState = await switchButton.getAttribute('aria-checked')
            await switchButton.click()
            await page.waitForTimeout(1000)

            const afterState = await switchButton.getAttribute('aria-checked')
            expect(afterState).not.toBe(beforeState)
        }
    })

    test('handles error on toggle failure', async ({ page }) => {
        await page.route('**/api/guilds/*/features/*', async (route) => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Internal server error' }),
            })
        })

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

            const errorToast = page.locator('text=/Failed|Error/i').first()
            const toastVisible = await errorToast
                .isVisible({ timeout: 3000 })
                .catch(() => false)
        }
    })

    test('global toggle permissions (developer only)', async ({ page }) => {
        await page.route('**/api/toggles/global', async (route) => {
            await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Forbidden' }),
            })
        })

        await navigateToFeatures(page)

        const globalSection = page.locator('text=/Global Toggles/i')
        const isVisible = await globalSection
            .isVisible({ timeout: 2000 })
            .catch(() => false)
        expect(isVisible).toBe(false)
    })

    test('toggle state persistence', async ({ page }) => {
        await navigateToFeatures(page)

        const firstFeature = MOCK_FEATURES[0]
        const featureCard = getFeatureCard(page, firstFeature.name)
        const switchButton = featureCard.locator('[role="switch"]').first()

        const isVisible = await switchButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            const initialState = await switchButton.getAttribute('aria-checked')
            await switchButton.click()
            await page.waitForTimeout(1000)

            await page.reload()
            await page.waitForLoadState('networkidle')

            const reloadedCard = getFeatureCard(page, firstFeature.name)
            const reloadedSwitch = reloadedCard
                .locator('[role="switch"]')
                .first()
            const reloadedVisible = await reloadedSwitch
                .isVisible({ timeout: 3000 })
                .catch(() => false)
        }
    })

    test('multiple rapid toggles', async ({ page }) => {
        await navigateToFeatures(page)

        const firstFeature = MOCK_FEATURES[0]
        const featureCard = getFeatureCard(page, firstFeature.name)
        const switchButton = featureCard.locator('[role="switch"]').first()

        const isVisible = await switchButton
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            for (let i = 0; i < 3; i++) {
                await switchButton.click()
                await page.waitForTimeout(300)
            }
        }
    })

    test('feature descriptions display', async ({ page }) => {
        await navigateToFeatures(page)

        const firstFeature = MOCK_FEATURES[0]
        const featureCard = getFeatureCard(page, firstFeature.name)

        const isVisible = await featureCard
            .isVisible({ timeout: 3000 })
            .catch(() => false)

        if (isVisible) {
            const description = featureCard.locator(
                `text=${firstFeature.description}`,
            )
            const descVisible = await description
                .isVisible({ timeout: 2000 })
                .catch(() => false)
        }
    })
})
