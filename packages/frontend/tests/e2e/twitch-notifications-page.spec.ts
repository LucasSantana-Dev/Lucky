import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'

const GUILD_ID = '111111111111111111'
const GUILD_STORAGE = JSON.stringify({
    id: GUILD_ID,
    name: 'Test Server 1',
})

async function waitForAppLoaderToSettle(page: import('@playwright/test').Page) {
    await page
        .locator('[role="status"]:has-text("Loading...")')
        .first()
        .waitFor({ state: 'hidden', timeout: 20000 })
        .catch(() => {})
}

const MOCK_NOTIFICATIONS = [
    {
        id: 'notif-1',
        guildId: GUILD_ID,
        twitchUserId: '12345',
        twitchLogin: 'shroud',
        discordChannelId: '999888777666555444',
    },
    {
        id: 'notif-2',
        guildId: GUILD_ID,
        twitchUserId: '67890',
        twitchLogin: 'pokimane',
        discordChannelId: '999888777666555443',
    },
]

function mockTwitchNotifications(
    page: import('@playwright/test').Page,
    notifications = MOCK_NOTIFICATIONS,
) {
    return page.route('**/api/guilds/*/twitch/notifications', async (route) => {
        const method = route.request().method()

        if (method === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true',
                },
                body: JSON.stringify({ notifications }),
            })
            return
        }

        if (method === 'POST' || method === 'DELETE') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            })
            return
        }

        await route.continue()
    })
}

test.describe('Twitch Notifications Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/twitch/status', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ configured: true }),
            })
        })
        await page.route('**/api/guilds/*/channels**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ channels: [] }),
            })
        })
        await setupMockApiResponses(page)
        await page.route('**/api/guilds/*/me**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    guildId: GUILD_ID,
                    nickname: 'Server Nick',
                    username: 'testuser',
                    globalName: 'Test User',
                    roleIds: ['role-mod'],
                    effectiveAccess: {
                        overview: 'manage',
                        settings: 'manage',
                        moderation: 'manage',
                        automation: 'manage',
                        music: 'manage',
                        integrations: 'manage',
                    },
                    canManageRbac: true,
                }),
            })
        })
    })

    test('shows select server prompt when no guild', async ({ page }) => {
        await page.route('**/api/guilds', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ guilds: [] }),
            })
        })

        await page.goto('/twitch')
        await page.waitForLoadState('domcontentloaded')

        await expect(
            page.getByText('Select a server to manage Twitch notifications'),
        ).toBeVisible({ timeout: 10000 })
    })

    test('displays notification list with count', async ({ page }) => {
        await mockTwitchNotifications(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/twitch')
        await page.waitForLoadState('domcontentloaded')
        await expect(
            page
                .locator('#lucky-main-content')
                .getByRole('heading', { name: /Twitch Notifications/i }),
        ).toBeVisible({ timeout: 10000 })
        await waitForAppLoaderToSettle(page)

        await expect(page.getByText('(2)').first()).toBeVisible({
            timeout: 5000,
        })
        await expect(page.getByText('shroud')).toBeVisible({ timeout: 5000 })
        await expect(page.getByText('pokimane')).toBeVisible({ timeout: 5000 })
    })

    test('shows empty state when no notifications', async ({ page }) => {
        await mockTwitchNotifications(page, [])
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/twitch')
        await page.waitForLoadState('domcontentloaded')
        await expect(
            page
                .locator('#lucky-main-content')
                .getByRole('heading', { name: /Twitch Notifications/i }),
        ).toBeVisible({ timeout: 10000 })
        await waitForAppLoaderToSettle(page)

        await expect(
            page.getByText('No Twitch notifications configured'),
        ).toBeVisible({ timeout: 5000 })
    })

    test('opens add notification form', async ({ page }) => {
        await mockTwitchNotifications(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/twitch')
        await page.waitForLoadState('domcontentloaded')
        await expect(
            page
                .locator('#lucky-main-content')
                .getByRole('heading', { name: /Twitch Notifications/i }),
        ).toBeVisible({ timeout: 10000 })
        await waitForAppLoaderToSettle(page)

        await page.getByRole('button', { name: /Add/ }).first().click()

        await expect(page.getByText('Add Twitch Notification')).toBeVisible({
            timeout: 3000,
        })
        await expect(
            page.locator('input[placeholder^="Twitch URL or login"]'),
        ).toBeVisible()

        // The channel is picked from a select, not typed as an ID.
        await expect(
            page
                .getByRole('combobox')
                .filter({ hasText: 'Select Discord channel' })
                .first(),
        ).toBeVisible()
    })

    test('save button disabled when form incomplete', async ({ page }) => {
        await mockTwitchNotifications(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/twitch')
        await page.waitForLoadState('domcontentloaded')
        await expect(
            page
                .locator('#lucky-main-content')
                .getByRole('heading', { name: /Twitch Notifications/i }),
        ).toBeVisible({ timeout: 10000 })
        await waitForAppLoaderToSettle(page)

        await page.getByRole('button', { name: /Add/ }).first().click()

        await expect(page.getByRole('button', { name: /Save/ })).toBeDisabled()
    })

    test('cancel button hides the form', async ({ page }) => {
        await mockTwitchNotifications(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/twitch')
        await page.waitForLoadState('domcontentloaded')
        await expect(
            page
                .locator('#lucky-main-content')
                .getByRole('heading', { name: /Twitch Notifications/i }),
        ).toBeVisible({ timeout: 10000 })
        await waitForAppLoaderToSettle(page)

        await page.getByRole('button', { name: /Add/ }).first().click()
        await expect(page.getByText('Add Twitch Notification')).toBeVisible()

        await page.getByRole('button', { name: 'Cancel' }).click()

        await expect(page.getByText('Add Twitch Notification')).not.toBeVisible(
            {
                timeout: 3000,
            },
        )
    })

    test('displays channel IDs for each notification', async ({ page }) => {
        await mockTwitchNotifications(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/twitch')
        await page.waitForLoadState('domcontentloaded')
        await expect(
            page
                .locator('#lucky-main-content')
                .getByRole('heading', { name: /Twitch Notifications/i }),
        ).toBeVisible({ timeout: 10000 })
        await waitForAppLoaderToSettle(page)

        await expect(page.getByText('999888777666555444')).toBeVisible({
            timeout: 5000,
        })
        await expect(page.getByText('999888777666555443')).toBeVisible({
            timeout: 5000,
        })
    })

    test('shows error state on API failure', async ({ page }) => {
        await page.route(
            '**/api/guilds/*/twitch/notifications',
            async (route) => {
                await route.fulfill({ status: 500 })
            },
        )
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/twitch')
        await page.waitForLoadState('domcontentloaded')
        await expect(
            page
                .locator('#lucky-main-content')
                .getByRole('heading', { name: /Twitch Notifications/i }),
        ).toBeVisible({ timeout: 10000 })
        await waitForAppLoaderToSettle(page)

        await expect(
            page.getByText('Failed to load Twitch notifications'),
        ).toBeVisible({ timeout: 5000 })
    })
})
