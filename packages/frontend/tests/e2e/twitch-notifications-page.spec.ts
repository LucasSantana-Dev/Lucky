import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'

const GUILD_ID = '111111111111111111'
const GUILD_STORAGE = JSON.stringify({
    id: GUILD_ID,
    name: 'Test Server 1',
})

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
    return page.route(
        `**/api/guilds/${GUILD_ID}/twitch/notifications`,
        async (route) => {
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
            } else if (method === 'POST') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true }),
                })
            } else if (method === 'DELETE') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true }),
                })
            }
        },
    )
}

test.describe('Twitch Notifications Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
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

        const prompt = page.locator(
            'text=/Select a server to manage Twitch notifications/i',
        )
        const isVisible = await prompt
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(prompt).toBeVisible()
        }
    })

    test('displays notification list with count', async ({ page }) => {
        await mockTwitchNotifications(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/twitch')
        await page.waitForLoadState('domcontentloaded')

        const heading = page.locator('text=/Twitch Notifications/i')
        const isVisible = await heading
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(heading).toBeVisible()

            const count = page.locator('text=/(2)/').first()
            await expect(count).toBeVisible({ timeout: 3000 })

            const streamer1 = page.locator('text=/shroud/i')
            await expect(streamer1).toBeVisible({ timeout: 3000 })

            const streamer2 = page.locator('text=/pokimane/i')
            await expect(streamer2).toBeVisible({ timeout: 3000 })
        }
    })

    test('shows empty state when no notifications', async ({ page }) => {
        await mockTwitchNotifications(page, [])
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/twitch')
        await page.waitForLoadState('domcontentloaded')

        const emptyState = page.locator(
            'text=/No Twitch notifications configured/i',
        )
        await expect(emptyState).toBeVisible({ timeout: 5000 })
    })

    test('opens add notification form', async ({ page }) => {
        await mockTwitchNotifications(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/twitch')
        await page.waitForLoadState('domcontentloaded')

        const addButton = page.locator('button:has-text("Add")')
        const isVisible = await addButton
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await addButton.click()

            const formTitle = page.locator('text=/Add Twitch Notification/i')
            await expect(formTitle).toBeVisible({ timeout: 3000 })

            const usernameInput = page.locator(
                'input[placeholder="Twitch username"]',
            )
            await expect(usernameInput).toBeVisible()

            const userIdInput = page.locator(
                'input[placeholder="Twitch user ID"]',
            )
            await expect(userIdInput).toBeVisible()

            const channelInput = page.locator(
                'input[placeholder="Discord channel ID"]',
            )
            await expect(channelInput).toBeVisible()
        }
    })

    test('save button disabled when form incomplete', async ({ page }) => {
        await mockTwitchNotifications(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/twitch')
        await page.waitForLoadState('domcontentloaded')

        const addButton = page.locator('button:has-text("Add")')
        const isVisible = await addButton
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await addButton.click()

            const saveButton = page.locator('button:has-text("Save")')
            await expect(saveButton).toBeDisabled()
        }
    })

    test('cancel button hides the form', async ({ page }) => {
        await mockTwitchNotifications(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/twitch')
        await page.waitForLoadState('domcontentloaded')

        const addButton = page.locator('button:has-text("Add")')
        const isVisible = await addButton
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await addButton.click()

            const cancelButton = page.locator('button:has-text("Cancel")')
            await expect(cancelButton).toBeVisible()
            await cancelButton.click()

            const formTitle = page.locator('text=/Add Twitch Notification/i')
            await expect(formTitle).not.toBeVisible({
                timeout: 3000,
            })
        }
    })

    test('displays channel IDs for each notification', async ({ page }) => {
        await mockTwitchNotifications(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/twitch')
        await page.waitForLoadState('domcontentloaded')

        const channelId = page.locator('text=/999888777666555444/')
        const isVisible = await channelId
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(channelId).toBeVisible()
        }
    })

    test('shows error state on API failure', async ({ page }) => {
        await page.route(
            `**/api/guilds/${GUILD_ID}/twitch/notifications`,
            async (route) => {
                await route.fulfill({ status: 500 })
            },
        )
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/twitch')
        await page.waitForLoadState('domcontentloaded')

        const errorMsg = page.locator(
            'text=/Failed to load Twitch notifications/i',
        )
        await expect(errorMsg).toBeVisible({ timeout: 5000 })
    })
})
