import { test, expect, type Page } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'
import { MOCK_API_RESPONSES } from './fixtures/test-data'

// Pages that no other spec opens. Their own data endpoints are answered with
// a 404, so each test also proves the page keeps its heading and does not
// throw when its data fails to load.
const GUILD_PAGES = [
    {
        route: '/embed-builder',
        heading: 'Embed Builder',
        copy: 'Create and manage reusable Discord embed templates',
    },
    {
        route: '/reaction-roles',
        heading: 'Reaction Roles',
        copy: 'Create Discord messages with button-based role assignment',
    },
    {
        route: '/role-groups',
        heading: 'Role Groups',
        copy: 'Create and manage styled role collections.',
    },
    {
        route: '/roles',
        heading: 'Roles',
        copy: "Manage your server's Discord roles",
    },
    {
        route: '/guild-automation',
        heading: 'Guild Automation',
        copy: 'Manage your guild configuration as code',
    },
    {
        route: '/levels',
        heading: 'Level System',
        copy: 'Configure XP, level roles, and leaderboards.',
    },
    {
        route: '/batch-jobs',
        heading: 'Batch Jobs',
        copy: 'Manage bulk operations on your server',
    },
    {
        route: '/music/artists',
        heading: 'Musical Taste',
        copy: 'Choose artists to guide autoplay recommendations.',
    },
    {
        route: '/lastfm',
        heading: 'Last.fm',
        copy: 'Scrobble tracks you play to your Last.fm profile',
    },
    {
        route: '/spotify',
        heading: 'Spotify',
        copy: 'Connect your Spotify account for personalized autoplay',
    },
]

const PUBLIC_PAGES = [
    {
        route: '/terms-of-service',
        heading: 'Terms of Service',
        copy: 'By using Lucky, you agree to these Terms of Service.',
    },
    {
        route: '/privacy-policy',
        heading: 'Privacy Policy',
        copy: 'This policy explains how Lucky collects, uses, and protects',
    },
    {
        route: '/docs',
        heading: 'Overview',
        copy: 'Lucky is an open-source Discord bot.',
    },
    {
        route: '/changelog',
        heading: 'Changelog',
        copy: 'Notable changes per release.',
    },
    {
        route: '/support',
        heading: 'Report a problem',
        copy: null,
    },
]

function collectPageErrors(page: Page): string[] {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    return errors
}

// Registered before the specific mocks, so it only answers what they leave.
async function failUnmockedApiCalls(page: Page): Promise<void> {
    await page.route('**/api/**', async (route) => {
        await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Not found' }),
        })
    })
}

async function mockSession(page: Page, isDeveloper: boolean): Promise<void> {
    await failUnmockedApiCalls(page)
    await setupMockApiResponses(page)
    if (!isDeveloper) return
    await page.route('**/api/auth/status', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                ...MOCK_API_RESPONSES.authStatus,
                user: {
                    ...MOCK_API_RESPONSES.authStatus.user,
                    isDeveloper: true,
                },
            }),
        })
    })
}

test.describe('Pages without other e2e coverage', () => {
    for (const { route, heading, copy } of GUILD_PAGES) {
        test(`${route} renders for a signed-in member`, async ({ page }) => {
            const errors = collectPageErrors(page)
            await mockSession(page, false)

            await page.goto(route)

            await expect(
                page.getByRole('heading', { level: 1, name: heading }).first(),
            ).toBeVisible({ timeout: 10000 })
            await expect(page.getByText(copy).first()).toBeVisible()
            await page.waitForLoadState('networkidle')
            await expect(page).toHaveURL(new RegExp(`${route}$`))
            expect(errors).toEqual([])
        })
    }

    for (const { route, heading, copy } of PUBLIC_PAGES) {
        test(`${route} renders without a session`, async ({ page }) => {
            const errors = collectPageErrors(page)
            await failUnmockedApiCalls(page)
            await page.route('**/api/auth/status', async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ authenticated: false }),
                })
            })

            await page.goto(route)

            await expect(
                page.getByRole('heading', { level: 1, name: heading }),
            ).toBeVisible({ timeout: 10000 })
            if (copy) {
                await expect(page.getByText(copy).first()).toBeVisible()
            }
            await page.waitForLoadState('networkidle')
            await expect(page).toHaveURL(new RegExp(`${route}$`))
            expect(errors).toEqual([])
        })
    }

    for (const route of ['/admin', '/admin/support']) {
        test(`${route} is denied to a non-developer`, async ({ page }) => {
            const errors = collectPageErrors(page)
            await mockSession(page, false)

            await page.goto(route)

            await expect(
                page.getByRole('heading', { level: 1, name: 'Access Denied' }),
            ).toBeVisible({ timeout: 10000 })
            await expect(
                page.getByText(
                    'This page is restricted to bot administrators.',
                ),
            ).toBeVisible()
            await expect(
                page.getByRole('heading', { name: 'Global Feature Toggles' }),
            ).toHaveCount(0)
            expect(errors).toEqual([])
        })
    }

    test('/admin shows the global toggles to a developer', async ({ page }) => {
        const errors = collectPageErrors(page)
        await mockSession(page, true)

        await page.goto('/admin')

        await expect(
            page.getByRole('heading', { level: 1, name: 'Admin Panel' }),
        ).toBeVisible({ timeout: 10000 })
        await expect(
            page
                .getByRole('heading', { name: 'Global Feature Toggles' })
                .first(),
        ).toBeVisible()
        await expect(
            page.getByRole('heading', { level: 1, name: 'Access Denied' }),
        ).toHaveCount(0)
        expect(errors).toEqual([])
    })
})
