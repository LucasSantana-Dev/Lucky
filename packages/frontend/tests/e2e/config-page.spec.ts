import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'

const GUILD_STORAGE = JSON.stringify({
    id: '111111111111111111',
    name: 'Test Server 1',
})

test.describe('Config Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('shows configuration heading and active server', async ({ page }) => {
        await page.goto('/config')

        await expect(
            page
                .locator('#lucky-main-content')
                .getByText('Configuration', { exact: true }),
        ).toBeVisible()
        await expect(page.getByText('Server: Test Server 1')).toBeVisible()
    })

    test('displays module cards with guild selected', async ({ page }) => {
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/config')

        await expect(
            page.getByText('Available Configuration Modules'),
        ).toBeVisible()
        await expect(
            page.getByRole('button', { name: /Music Module/ }),
        ).toBeVisible()
        await expect(
            page.getByRole('button', { name: /Moderation/ }),
        ).toBeVisible()
    })

    test('shows module descriptions', async ({ page }) => {
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/config')

        await expect(
            page.getByText(
                'Configure music playback, queue management, and audio settings',
            ),
        ).toBeVisible()
        await expect(
            page.getByText(
                'Set up auto-moderation, filters, and moderation actions',
            ),
        ).toBeVisible()
    })
})
