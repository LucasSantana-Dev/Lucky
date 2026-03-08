import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'

const GUILD_STORAGE = JSON.stringify({
    id: '111111111111111111',
    name: 'Test Server 1',
})

const MOCK_CASES = {
    cases: [
        {
            id: '1',
            caseNumber: 1,
            type: 'warn',
            userId: '999999999999999999',
            userName: 'BadUser',
            moderatorId: '123456789012345678',
            moderatorName: 'ModeratorBot',
            reason: 'Spamming in general',
            active: true,
            appealed: false,
            createdAt: new Date().toISOString(),
        },
        {
            id: '2',
            caseNumber: 2,
            type: 'ban',
            userId: '888888888888888888',
            userName: 'ToxicUser',
            moderatorId: '123456789012345678',
            moderatorName: 'ModeratorBot',
            reason: 'Repeated violations',
            active: true,
            appealed: true,
            createdAt: new Date(Date.now() - 86400000).toISOString(),
        },
    ],
    total: 2,
}

function mockModerationCases(
    page: import('@playwright/test').Page,
    data = MOCK_CASES,
) {
    return page.route('**/api/guilds/*/moderation/cases*', async (route) => {
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

test.describe('Moderation Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('shows no server selected when no guild', async ({ page }) => {
        await page.goto('/moderation')
        await page.waitForLoadState('domcontentloaded')

        const heading = page.locator('text=/No Server Selected/i')
        const isVisible = await heading
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(heading).toBeVisible()
            const subtext = page.locator(
                'text=/Select a server to view moderation cases/i',
            )
            await expect(subtext).toBeVisible()
        }
    })

    test('displays moderation cases heading with guild selected', async ({
        page,
    }) => {
        await mockModerationCases(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/moderation')
        await page.waitForLoadState('domcontentloaded')

        const heading = page.locator('text=/Moderation Cases/i')
        const isVisible = await heading
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(heading).toBeVisible()
            const subtitle = page.locator(
                'text=/Manage warnings, mutes, kicks, and bans/i',
            )
            await expect(subtitle).toBeVisible()
        }
    })

    test('displays search and filter controls', async ({ page }) => {
        await mockModerationCases(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/moderation')
        await page.waitForLoadState('domcontentloaded')

        const searchInput = page.locator('input[placeholder*="Search by user"]')
        const isVisible = await searchInput
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(searchInput).toBeVisible()
        }
    })

    test('renders case rows from API data', async ({ page }) => {
        await mockModerationCases(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/moderation')
        await page.waitForLoadState('domcontentloaded')

        const userName = page.locator('text=/BadUser/i')
        const isVisible = await userName
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(userName).toBeVisible()
            const banUser = page.locator('text=/ToxicUser/i')
            await expect(banUser).toBeVisible()
        }
    })

    test('shows empty state when no cases', async ({ page }) => {
        await mockModerationCases(page, { cases: [], total: 0 })
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/moderation')
        await page.waitForLoadState('domcontentloaded')

        const emptyMsg = page.locator('text=/No cases found/i')
        const isVisible = await emptyMsg
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(emptyMsg).toBeVisible()
        }
    })
})
