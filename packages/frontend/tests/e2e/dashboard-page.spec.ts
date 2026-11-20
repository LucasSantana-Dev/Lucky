import { test, expect, type Page } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'
import { navigateToDashboard, waitForDashboard } from './helpers/page-helpers'
import { getServerSelector } from './helpers/ui-helpers'
import { MOCK_API_RESPONSES, MOCK_GUILDS } from './fixtures/test-data'

const FIRST_BOT_SERVER = MOCK_GUILDS.find((g) => g.hasBot)!

async function mockGuilds(page: Page, guilds: unknown[]): Promise<void> {
    await page.route('**/api/guilds', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ guilds }),
        })
    })
}

test.describe('Dashboard Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('auto-selects first server with bot when available', async ({
        page,
    }) => {
        await navigateToDashboard(page)
        await waitForDashboard(page)

        await expect(getServerSelector(page)).toHaveAccessibleName(
            `Active server: ${FIRST_BOT_SERVER.name}. Click to switch.`,
        )
    })

    test('displays No Server Selected state when no bot servers', async ({
        page,
    }) => {
        await mockGuilds(
            page,
            MOCK_GUILDS.filter((g) => !g.hasBot),
        )

        await navigateToDashboard(page)
        await waitForDashboard(page)

        await expect(
            page.getByRole('heading', { name: 'Select a Server' }),
        ).toBeVisible()
        await expect(getServerSelector(page)).toHaveAccessibleName(
            'Select a server',
        )
    })

    test('server selector chip in header shows the active server', async ({
        page,
    }) => {
        await navigateToDashboard(page)
        await waitForDashboard(page)

        await expect(getServerSelector(page)).toContainText(
            FIRST_BOT_SERVER.name,
        )
    })

    test('server selector chip opens the servers page to switch server', async ({
        page,
    }) => {
        await navigateToDashboard(page)
        await waitForDashboard(page)

        await getServerSelector(page).click()
        await expect(page).toHaveURL(/\/servers$/)

        const secondBotServer = MOCK_GUILDS.filter((g) => g.hasBot)[1]
        await page
            .getByRole('button', {
                name: new RegExp(`^Manage ${secondBotServer.name}$`, 'i'),
            })
            .click()

        await expect(page).toHaveURL(/\/$/)
        await expect(getServerSelector(page)).toHaveAccessibleName(
            `Active server: ${secondBotServer.name}. Click to switch.`,
        )
    })

    test('navigates to servers page from empty state', async ({ page }) => {
        await mockGuilds(page, [])

        await navigateToDashboard(page)
        await waitForDashboard(page)

        await getServerSelector(page).click()
        await expect(page).toHaveURL(/\/servers$/)
    })

    test('dashboard renders its panels for the selected server', async ({
        page,
    }) => {
        await navigateToDashboard(page)
        await waitForDashboard(page)

        const main = page.locator('main')
        await expect(
            main.getByRole('heading', { name: 'Recent Music' }),
        ).toBeVisible()
        await expect(
            main.getByRole('heading', { name: 'Quick Actions' }),
        ).toBeVisible()
        await expect(
            main.getByRole('heading', { name: 'Recent Cases' }),
        ).toBeVisible()
    })

    test('server selection persists across navigation', async ({ page }) => {
        await navigateToDashboard(page)
        await waitForDashboard(page)

        await page.getByRole('link', { name: 'Features' }).first().click()
        await expect(page).toHaveURL(/\/features/)

        await expect(getServerSelector(page)).toHaveAccessibleName(
            `Active server: ${FIRST_BOT_SERVER.name}. Click to switch.`,
        )
    })

    test('shows loading states during server fetch', async ({ page }) => {
        let release!: () => void
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        await page.route('**/api/guilds', async (route) => {
            await gate
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(MOCK_API_RESPONSES.guildsList),
            })
        })

        await navigateToDashboard(page)

        // While the guild request is held, no server is active yet.
        await expect(getServerSelector(page)).toHaveAccessibleName(
            'Select a server',
        )

        release()
        await expect(getServerSelector(page)).toHaveAccessibleName(
            `Active server: ${FIRST_BOT_SERVER.name}. Click to switch.`,
        )
    })
})
