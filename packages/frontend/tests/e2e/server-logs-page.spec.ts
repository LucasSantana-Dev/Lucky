import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'

const GUILD_STORAGE = JSON.stringify({
    id: '111111111111111111',
    name: 'Test Server 1',
})

const MOCK_LOGS = {
    logs: [
        {
            id: '1',
            level: 'info',
            message: 'User joined the server',
            source: 'gateway',
            createdAt: new Date().toISOString(),
        },
        {
            id: '2',
            level: 'warn',
            message: 'Rate limit approaching',
            source: 'api',
            createdAt: new Date(Date.now() - 60000).toISOString(),
        },
    ],
    total: 2,
}

function mockServerLogs(
    page: import('@playwright/test').Page,
    data = MOCK_LOGS,
) {
    return page.route('**/api/guilds/*/logs*', async (route) => {
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

test.describe('Server Logs Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('shows no server selected when no guild', async ({ page }) => {
        await page.route('**/api/guilds', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ guilds: [] }),
            })
        })

        await page.goto('/logs')
        await page.waitForLoadState('domcontentloaded')

        const heading = page.locator('text=/No Server Selected/i')
        await expect(heading).toBeVisible({ timeout: 5000 })
    })

    test('displays server logs heading with guild', async ({ page }) => {
        await mockServerLogs(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/logs')
        await page.waitForLoadState('domcontentloaded')

        const heading = page.getByRole('heading', {
            name: 'Server Logs',
            exact: true,
        })
        await expect(heading).toBeVisible({ timeout: 5000 })
    })

    test('displays search and filter controls', async ({ page }) => {
        await mockServerLogs(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/logs')
        await page.waitForLoadState('domcontentloaded')

        const searchInput = page.locator('input[placeholder*="Search"]')
        await expect(searchInput).toBeVisible({ timeout: 5000 })
    })

    test('shows empty state when no logs', async ({ page }) => {
        await mockServerLogs(page, { logs: [], total: 0 })
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/logs')
        await page.waitForLoadState('domcontentloaded')

        const emptyMsg = page.locator('text=/No logs found/i')
        await expect(emptyMsg).toBeVisible({ timeout: 5000 })
    })
})
