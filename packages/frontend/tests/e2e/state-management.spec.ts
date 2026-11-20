import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'
import { navigateToDashboard, navigateToFeatures } from './helpers/page-helpers'
import { getServerSelector } from './helpers/ui-helpers'
import { MOCK_GUILDS } from './fixtures/test-data'

const ACTIVE_NAME = `Active server: ${MOCK_GUILDS.find((g) => g.hasBot)!.name}. Click to switch.`

test.describe('State Management', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('auth state updates correctly', async ({ page }) => {
        await navigateToDashboard(page)

        const sidebar = page.locator('aside').first()
        await expect(sidebar).toBeVisible({ timeout: 5000 })
    })

    test('guild state updates correctly', async ({ page }) => {
        await navigateToDashboard(page)

        await expect(getServerSelector(page)).toHaveAccessibleName(ACTIVE_NAME)
    })

    test('features state updates correctly', async ({ page }) => {
        await navigateToFeatures(page)

        await expect(
            page
                .locator('#lucky-main-content')
                .getByRole('heading', { name: 'Features', exact: true }),
        ).toBeVisible()
    })

    test('state persists across page reloads', async ({ page }) => {
        await navigateToDashboard(page)
        await expect(getServerSelector(page)).toHaveAccessibleName(ACTIVE_NAME)

        await page.reload()

        await expect(page.locator('aside').first()).toBeVisible()
        await expect(getServerSelector(page)).toHaveAccessibleName(ACTIVE_NAME)
    })

    test('state synchronization between stores', async ({ page }) => {
        await navigateToDashboard(page)
        await navigateToFeatures(page)

        await expect(page.locator('aside').first()).toBeVisible()
        await expect(getServerSelector(page)).toHaveAccessibleName(ACTIVE_NAME)
    })

    test('feature switches stay read-only and send no writes', async ({
        page,
    }) => {
        const writes: string[] = []
        page.on('request', (request) => {
            if (request.url().includes('/api/') && request.method() !== 'GET') {
                writes.push(request.method())
            }
        })

        await navigateToFeatures(page)

        const switches = page.getByRole('switch')
        await expect(switches.first()).toBeVisible()
        for (const toggle of await switches.all()) {
            await expect(toggle).toBeDisabled()
        }
        expect(writes).toEqual([])
    })
})
