import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'
import { navigateToFeatures, waitForFeatures } from './helpers/page-helpers'
import { getFeatureCard } from './helpers/ui-helpers'
import { MOCK_FEATURES } from './fixtures/test-data'

const featureLabel = (name: string): string =>
    name
        .toLowerCase()
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')

test.describe('Feature Toggles', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('lists every feature with its description', async ({ page }) => {
        await navigateToFeatures(page)
        await waitForFeatures(page)

        await expect(
            page.getByRole('heading', { name: 'Available Features' }),
        ).toBeVisible()

        for (const feature of MOCK_FEATURES) {
            const card = getFeatureCard(page, feature.name)
            await expect(card).toBeVisible()
            await expect(card).toContainText(feature.description)
        }
        await expect(page.getByRole('switch')).toHaveCount(MOCK_FEATURES.length)
    })

    test('feature switches are read-only and marked as managed', async ({
        page,
    }) => {
        await navigateToFeatures(page)
        await waitForFeatures(page)

        for (const feature of MOCK_FEATURES) {
            const card = getFeatureCard(page, feature.name)
            const toggle = card.getByRole('switch', {
                name: `Toggle ${featureLabel(feature.name)}`,
            })
            await expect(toggle).toBeDisabled()
            await expect(card).toContainText('Managed')
        }
    })

    test('read-only switches are disabled and send no write request', async ({
        page,
    }) => {
        const writes: string[] = []
        page.on('request', (request) => {
            if (request.url().includes('/api/') && request.method() !== 'GET') {
                writes.push(`${request.method()} ${request.url()}`)
            }
        })

        await navigateToFeatures(page)
        await waitForFeatures(page)

        const toggle = page.getByRole('switch', { name: 'Toggle Autoplay' })
        const before = await toggle.getAttribute('aria-checked')
        await expect(toggle).toBeDisabled()

        await expect(toggle).toHaveAttribute('aria-checked', before ?? '')
        await page.waitForLoadState('networkidle')
        expect(writes).toEqual([])
    })
})
