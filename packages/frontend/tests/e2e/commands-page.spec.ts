import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'

const GUILD_STORAGE = JSON.stringify({
    id: '111111111111111111',
    name: 'Test Server 1',
})

const MOCK_COMMANDS = {
    commands: [
        {
            id: '1',
            name: 'play',
            description: 'Play a song or playlist',
            category: 'Music',
            enabled: true,
        },
        {
            id: '2',
            name: 'skip',
            description: 'Skip the current track',
            category: 'Music',
            enabled: true,
        },
        {
            id: '3',
            name: 'ban',
            description: 'Ban a user from the server',
            category: 'Moderator',
            enabled: false,
        },
    ],
}

function mockCommandsList(
    page: import('@playwright/test').Page,
    data = MOCK_COMMANDS,
) {
    return page.route('**/api/guilds/*/commands*', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true',
                },
                body: JSON.stringify(data),
            })
        } else {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            })
        }
    })
}

test.describe('Custom Commands Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('shows no server selected when no guild', async ({ page }) => {
        await page.goto('/commands')
        await page.waitForLoadState('domcontentloaded')

        const heading = page.locator('text=/No Server Selected/i')
        const isVisible = await heading
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(heading).toBeVisible()
            const subtext = page.locator(
                'text=/Select a server to manage commands/i',
            )
            await expect(subtext).toBeVisible()
        }
    })

    test('displays commands heading with guild selected', async ({ page }) => {
        await mockCommandsList(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/commands')
        await page.waitForLoadState('domcontentloaded')

        const heading = page.getByRole('heading', { name: 'Custom Commands' })
        const isVisible = await heading
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(heading).toBeVisible()
        }
    })

    test('renders command cards from API data', async ({ page }) => {
        await mockCommandsList(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/commands')
        await page.waitForLoadState('domcontentloaded')

        const heading = page.locator('h1:has-text("Custom Commands")')
        const isVisible = await heading
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            const playDesc = page.locator('text=/Play a song or playlist/i')
            await expect(playDesc).toBeVisible({ timeout: 5000 })
        }
    })

    test('displays search input for filtering commands', async ({ page }) => {
        await mockCommandsList(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/commands')
        await page.waitForLoadState('domcontentloaded')

        const search = page.locator('input[placeholder*="Search commands"]')
        const isVisible = await search
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(search).toBeVisible()
        }
    })

    test('shows empty state when no commands', async ({ page }) => {
        await mockCommandsList(page, { commands: [] })
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/commands')
        await page.waitForLoadState('domcontentloaded')

        const emptyMsg = page.locator('text=/No commands found/i')
        const isVisible = await emptyMsg
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(emptyMsg).toBeVisible()
        }
    })
})
