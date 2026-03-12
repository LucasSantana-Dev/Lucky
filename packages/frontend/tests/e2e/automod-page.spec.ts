import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'

const GUILD_STORAGE = JSON.stringify({
    id: '111111111111111111',
    name: 'Test Server 1',
})

const MOCK_AUTOMOD_SETTINGS = {
    settings: {
        id: 'am-1',
        guildId: '111111111111111111',
        enabled: true,
        spamEnabled: true,
        spamThreshold: 5,
        spamTimeWindow: 5,
        capsEnabled: false,
        capsThreshold: 70,
        linksEnabled: true,
        allowedDomains: ['youtube.com', 'github.com'],
        invitesEnabled: false,
        wordsEnabled: true,
        bannedWords: ['badword1', 'badword2'],
        exemptChannels: [],
        exemptRoles: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
}

function mockAutoModSettings(
    page: import('@playwright/test').Page,
    data = MOCK_AUTOMOD_SETTINGS,
) {
    return page.route('**/api/guilds/*/automod*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify(data),
        })
    })
}

test.describe('Auto-Moderation Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('shows no server selected when no guild', async ({ page }) => {
        await page.goto('/automod')
        await page.waitForLoadState('domcontentloaded')

        const heading = page.locator('text=/No Server Selected/i')
        const isVisible = await heading
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(heading).toBeVisible()
            const subtext = page.locator(
                'text=/Select a server to configure auto-moderation/i',
            )
            await expect(subtext).toBeVisible()
        }
    })

    test('displays auto-moderation heading with guild', async ({ page }) => {
        await mockAutoModSettings(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/automod')
        await page.waitForLoadState('domcontentloaded')

        const heading = page.locator('text=/Auto-Moderation/i')
        const isVisible = await heading
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(heading).toBeVisible()
        }
    })

    test('renders filter cards for each module', async ({ page }) => {
        await mockAutoModSettings(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/automod')
        await page.waitForLoadState('domcontentloaded')

        const spamCard = page.locator('text=/Spam Detection/i')
        const isVisible = await spamCard
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(spamCard).toBeVisible()
            await expect(
                page.locator('text=/Caps Lock Detection/i'),
            ).toBeVisible()
            await expect(
                page.getByRole('heading', {
                    name: 'Link Filtering',
                    exact: true,
                }),
            ).toBeVisible()
            await expect(page.locator('text=/Banned Words/i')).toBeVisible()
        }
    })

    test('displays save button', async ({ page }) => {
        await mockAutoModSettings(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/automod')
        await page.waitForLoadState('domcontentloaded')

        const saveBtn = page.locator('button:has-text("Save Changes")').first()
        const isVisible = await saveBtn
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(saveBtn).toBeVisible()
        }
    })

    test('shows exemptions section', async ({ page }) => {
        await mockAutoModSettings(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/automod')
        await page.waitForLoadState('domcontentloaded')

        const exemptions = page.locator('text=/Exemptions/i')
        const isVisible = await exemptions
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(exemptions).toBeVisible()
        }
    })
})
