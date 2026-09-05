import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'

const GUILD_ID = '111111111111111111'
const GUILD_STORAGE = JSON.stringify({
    id: GUILD_ID,
    name: 'Test Server 1',
})

// Real `GuildSettings` columns (prisma/schema.prisma:206-230) — the shape
// `toPrismaData` actually persists, not the dead `commandPrefix`/`nickname`/
// `managerRoles`/`updatesChannel`/`disableWarnings`/`timezone` fields the
// dashboard used to post (#2219).
const MOCK_SETTINGS = {
    prefix: '!',
    embedColor: '0x5865F2',
    language: 'en',
    allowPlaylists: true,
    allowSpotify: true,
    commandCooldown: 3,
    maxQueueSize: 100,
    defaultVolume: 50,
    voteSkipThreshold: 50,
}

test.describe('Server Settings save payload', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('saves prefix and posts the real column name, not commandPrefix', async ({
        page,
    }) => {
        let capturedBody: Record<string, unknown> | null = null

        // Registered after setupMockApiResponses, so this route wins for
        // `**/api/guilds/*/settings` and can distinguish GET from the save.
        await page.route('**/api/guilds/*/settings', async (route) => {
            const request = route.request()

            if (request.method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Credentials': 'true',
                    },
                    body: JSON.stringify({ settings: MOCK_SETTINGS }),
                })
                return
            }

            if (request.method() === 'POST') {
                capturedBody = request.postDataJSON()
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true }),
                })
                return
            }

            await route.continue()
        })

        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/settings')
        await page.waitForLoadState('domcontentloaded')

        const prefixInput = page.getByPlaceholder('!')
        await expect(prefixInput).toBeVisible({ timeout: 10000 })
        await prefixInput.fill('?')

        const saveButton = page
            .getByRole('button', { name: /Save Changes/i })
            .first()
        await saveButton.click()

        await expect.poll(() => capturedBody, { timeout: 5000 }).not.toBeNull()

        expect(capturedBody).toMatchObject({ prefix: '?' })
        expect(capturedBody).not.toHaveProperty('commandPrefix')
    })
})
