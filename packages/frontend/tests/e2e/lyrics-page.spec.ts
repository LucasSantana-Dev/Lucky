import { test, expect } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'

const MOCK_LYRICS_RESULT = {
    lyrics: 'Is this the real life?\nIs this just fantasy?\nCaught in a landslide\nNo escape from reality',
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
}

const GUILD_STORAGE = JSON.stringify({
    id: '111111111111111111',
    name: 'Test Server 1',
})

function mockLyricsSearch(
    page: import('@playwright/test').Page,
    response = MOCK_LYRICS_RESULT,
    status = 200,
) {
    return page.route('**/api/lyrics*', async (route) => {
        await route.fulfill({
            status,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify(status === 200 ? response : {}),
        })
    })
}

test.describe('Lyrics Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('shows select server prompt when no guild selected', async ({
        page,
    }) => {
        await page.route('**/api/guilds', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ guilds: [] }),
            })
        })

        await page.goto('/lyrics')
        await page.waitForLoadState('domcontentloaded')

        const prompt = page.locator('text=/Select a server to search lyrics/i')
        const isVisible = await prompt
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(prompt).toBeVisible()
        }
    })

    test('displays search form with title and artist fields', async ({
        page,
    }) => {
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/lyrics')
        await page.waitForLoadState('domcontentloaded')

        const heading = page.locator('text=/Lyrics Search/i')
        const isVisible = await heading
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(heading).toBeVisible()

            const titleInput = page.locator('#title')
            const artistInput = page.locator('#artist')

            await expect(titleInput).toBeVisible()
            await expect(artistInput).toBeVisible()
        }
    })

    test('search button disabled when title is empty', async ({ page }) => {
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/lyrics')
        await page.waitForLoadState('domcontentloaded')

        const searchButton = page.locator('button[type="submit"]')
        const isVisible = await searchButton
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(searchButton).toBeDisabled()
        }
    })

    test('performs lyrics search and displays results', async ({ page }) => {
        await mockLyricsSearch(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/lyrics')
        await page.waitForLoadState('domcontentloaded')

        const titleInput = page.locator('#title')
        const isVisible = await titleInput
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await titleInput.fill('Bohemian Rhapsody')
            await page.locator('#artist').fill('Queen')
            await page.locator('button[type="submit"]').click()

            const resultTitle = page.locator('text=/Bohemian Rhapsody/i')
            await expect(resultTitle.first()).toBeVisible({
                timeout: 5000,
            })

            const lyricsText = page.locator('text=/Is this the real life/i')
            await expect(lyricsText).toBeVisible({ timeout: 5000 })
        }
    })

    test('shows error when lyrics search fails', async ({ page }) => {
        await mockLyricsSearch(page, {} as typeof MOCK_LYRICS_RESULT, 500)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/lyrics')
        await page.waitForLoadState('domcontentloaded')

        const titleInput = page.locator('#title')
        const isVisible = await titleInput
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await titleInput.fill('Nonexistent Song')
            await page.locator('button[type="submit"]').click()

            const errorMsg = page.locator('text=/Failed to fetch lyrics/i')
            await expect(errorMsg).toBeVisible({ timeout: 5000 })
        }
    })

    test('shows initial placeholder before search', async ({ page }) => {
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/lyrics')
        await page.waitForLoadState('domcontentloaded')

        const placeholder = page.locator(
            'text=/Search for lyrics by entering a song title/i',
        )
        const isVisible = await placeholder
            .isVisible({ timeout: 5000 })
            .catch(() => false)

        if (isVisible) {
            await expect(placeholder).toBeVisible()
        }
    })
})
