import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'
import { navigateToFeatures, navigateToServers } from './helpers/page-helpers'
import { MOCK_API_RESPONSES } from './fixtures/test-data'

test.describe('Error Handling', () => {
    test('401 errors redirect to login', async ({ page }) => {
        await page.route('**/api/auth/status', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ authenticated: false }),
            })
        })

        await page.goto('/login')
        await page.evaluate(() => localStorage.clear())
        await page.reload()
        await page.waitForLoadState('domcontentloaded')

        const loginButton = page.getByRole('button', {
            name: /login with discord/i,
        })
        await expect(loginButton).toBeVisible({ timeout: 10000 })
    })

    test('unauthenticated visit to a protected page shows the landing page', async ({
        page,
    }) => {
        await page.route('**/api/auth/status', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ authenticated: false }),
            })
        })

        await page.goto('/features')

        await expect(
            page.getByRole('banner').getByRole('link', { name: 'docs' }),
        ).toBeVisible({ timeout: 10000 })
        await expect(
            page.getByRole('heading', { name: 'Available Features' }),
        ).toHaveCount(0)
        await expect(page.getByRole('switch')).toHaveCount(0)
    })

    test('feature load failure shows an error banner with retry', async ({
        page,
    }) => {
        await setupMockApiResponses(page)
        let failing = true
        await page.route('**/api/features', async (route) => {
            if (failing) {
                await route.fulfill({
                    status: 500,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Internal server error' }),
                })
                return
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(MOCK_API_RESPONSES.featuresList),
            })
        })

        await navigateToFeatures(page)

        const banner = page.getByRole('heading', {
            name: 'Unable to load feature data',
        })
        await expect(banner).toBeVisible({ timeout: 10000 })
        await expect(page.getByRole('switch')).toHaveCount(0)

        failing = false
        await page.getByRole('button', { name: 'Retry' }).click()

        await expect(banner).toHaveCount(0)
        await expect(
            page.getByRole('switch', { name: 'Toggle Autoplay' }),
        ).toBeVisible()
    })

    test('guild load failure on /servers shows an alert with retry', async ({
        page,
    }) => {
        await setupMockApiResponses(page)
        let failing = true
        await page.route('**/api/guilds', async (route) => {
            if (failing) {
                await route.fulfill({
                    status: 500,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Internal server error' }),
                })
                return
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(MOCK_API_RESPONSES.guildsList),
            })
        })

        await navigateToServers(page)

        const alert = page.getByRole('alert')
        await expect(alert).toBeVisible({ timeout: 10000 })
        await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
        await expect(page.getByText('No servers yet')).toHaveCount(0)

        failing = false
        await alert.getByRole('button', { name: 'Retry' }).click()

        await expect(alert).toHaveCount(0)
        await expect(page.getByText('No servers yet')).toHaveCount(0)
    })
})
