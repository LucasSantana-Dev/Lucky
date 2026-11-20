import { test, expect, type Page } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'
import { MOCK_API_RESPONSES } from './fixtures/test-data'

// Pages that no other spec opens. Their own data endpoints are answered with
// a 404, so each test also proves the page keeps its heading and does not
// throw when its data fails to load. `request` is the path suffix of the
// data call the page must make, so a page that stops fetching fails too.
const GUILD_PAGES = [
    {
        route: '/embed-builder',
        request: '/embeds',
        heading: 'Embed Builder',
        copy: 'Create and manage reusable Discord embed templates',
    },
    {
        route: '/reaction-roles',
        request: '/reaction-roles',
        heading: 'Reaction Roles',
        copy: 'Create Discord messages with button-based role assignment',
    },
    {
        route: '/role-groups',
        request: '/role-groups',
        heading: 'Role Groups',
        copy: 'Create and manage styled role collections.',
    },
    {
        route: '/roles',
        request: '/roles/manage',
        heading: 'Roles',
        copy: "Manage your server's Discord roles",
    },
    {
        route: '/guild-automation',
        request: '/automation/status',
        heading: 'Guild Automation',
        copy: 'Manage your guild configuration as code',
    },
    {
        route: '/levels',
        request: '/levels/config',
        heading: 'Level System',
        copy: 'Configure XP, level roles, and leaderboards.',
    },
    {
        route: '/batch-jobs',
        request: '/batch-jobs',
        heading: 'Batch Jobs',
        copy: 'Manage bulk operations on your server',
    },
    {
        route: '/music/artists',
        request: '/api/users/me/preferred-artists',
        heading: 'Musical Taste',
        copy: 'Choose artists to guide autoplay recommendations.',
    },
    {
        route: '/lastfm',
        request: '/api/lastfm/status',
        heading: 'Last.fm',
        copy: 'Scrobble tracks you play to your Last.fm profile',
    },
    {
        route: '/spotify',
        request: '/api/spotify/status',
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
// Returns the paths it answered.
async function failUnmockedApiCalls(page: Page): Promise<string[]> {
    const paths: string[] = []
    await page.route('**/api/**', async (route) => {
        paths.push(new URL(route.request().url()).pathname)
        await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Not found' }),
        })
    })
    return paths
}

async function mockSession(
    page: Page,
    isDeveloper: boolean,
): Promise<string[]> {
    const unmocked = await failUnmockedApiCalls(page)
    await setupMockApiResponses(page)
    if (!isDeveloper) return unmocked
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
    return unmocked
}

async function mockSignedOut(page: Page): Promise<void> {
    await failUnmockedApiCalls(page)
    await page.route('**/api/auth/status', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ authenticated: false }),
        })
    })
}

test.describe('Pages without other e2e coverage', () => {
    for (const { route, request, heading, copy } of GUILD_PAGES) {
        test(`${route} renders for a signed-in member`, async ({ page }) => {
            const errors = collectPageErrors(page)
            const unmocked = await mockSession(page, false)

            await page.goto(route)

            await expect(
                page.getByRole('heading', { level: 1, name: heading }).first(),
            ).toBeVisible({ timeout: 10000 })
            await expect(page.getByText(copy).first()).toBeVisible()
            await page.waitForLoadState('networkidle')
            await expect(page).toHaveURL(new RegExp(`${route}$`))
            expect(
                unmocked.filter((path) => path.endsWith(request)),
            ).not.toEqual([])
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
            await page.waitForLoadState('networkidle')
            await expect(page).toHaveURL(new RegExp(`${route}$`))
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
        await page.waitForLoadState('networkidle')
        await expect(page).toHaveURL(/\/admin$/)
        expect(errors).toEqual([])
    })

    for (const route of ['/terms', '/privacy']) {
        test(`${route} alias renders the legal page`, async ({ page }) => {
            const errors = collectPageErrors(page)
            await mockSignedOut(page)

            await page.goto(route)

            await expect(
                page.getByRole('heading', { level: 1 }).first(),
            ).toBeVisible({ timeout: 10000 })
            await page.waitForLoadState('networkidle')
            await expect(page).toHaveURL(new RegExp(`${route}$`))
            expect(errors).toEqual([])
        })
    }

    for (const { route, source } of [
        { route: '/add?source=topgg', source: 'topgg' },
        { route: '/l/topgg', source: 'topgg' },
        { route: '/l/not-a-real-source', source: null },
    ]) {
        test(`${route} shows the landing page with an attributed add link`, async ({
            page,
        }) => {
            const errors = collectPageErrors(page)
            await mockSignedOut(page)

            await page.goto(route)

            await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
                timeout: 10000,
            })
            const addLink = page.getByRole('link', { name: 'Add to Discord' })
            await expect(addLink).toBeVisible()
            const href = await addLink.getAttribute('href')
            expect(href).toMatch(/^\/api\/add\?source=/)
            if (source) expect(href).toBe(`/api/add?source=${source}`)
            await page.waitForLoadState('networkidle')
            expect(errors).toEqual([])
        })
    }

    test('/admin/support lists reports for a developer', async ({ page }) => {
        const errors = collectPageErrors(page)
        const unmocked = await mockSession(page, true)

        await page.goto('/admin/support')

        await expect(
            page.getByRole('heading', { level: 1, name: 'Support reports' }),
        ).toBeVisible({ timeout: 10000 })
        await expect(
            page.getByRole('heading', { level: 1, name: 'Access Denied' }),
        ).toHaveCount(0)
        await page.waitForLoadState('networkidle')
        expect(
            unmocked.filter((path) => path.includes('/support')),
        ).not.toEqual([])
        expect(errors).toEqual([])
    })

    for (const [label, signedIn] of [
        ['signed out', false],
        ['signed in', true],
    ] as const) {
        test(`an unknown route shows the not-found page (${label})`, async ({
            page,
        }) => {
            const errors = collectPageErrors(page)
            if (signedIn) await mockSession(page, false)
            else await mockSignedOut(page)

            await page.goto('/this-route-does-not-exist')

            await expect(
                page.getByRole('heading', { level: 1, name: 'Page not found' }),
            ).toBeVisible({ timeout: 10000 })
            await expect(
                page.getByRole('link', { name: 'Back to home' }),
            ).toBeVisible()
            await page.waitForLoadState('networkidle')
            expect(errors).toEqual([])
        })
    }
})
