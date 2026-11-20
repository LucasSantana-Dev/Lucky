import { test, expect } from '@playwright/test'
import { setupMockApiResponses, mockGlobalToggles } from './helpers/api-helpers'
import { navigateToFeatures, waitForFeatures } from './helpers/page-helpers'
import { getFeatureCard, getServerSelector } from './helpers/ui-helpers'
import { MOCK_FEATURES } from './fixtures/test-data'

test.describe('Features Page', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
        await page.route('**/api/guilds/*/me**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    guildId: '111111111111111111',
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

    test('displays server-specific toggles section', async ({ page }) => {
        await navigateToFeatures(page)
        await waitForFeatures(page)
        await page
            .locator('[role="status"]:has-text("Loading...")')
            .first()
            .waitFor({ state: 'hidden', timeout: 15000 })
            .catch(() => {})

        await expect(
            page
                .locator('#lucky-main-content')
                .getByRole('heading', { name: 'Features', exact: true }),
        ).toBeVisible({ timeout: 15000 })
        await expect(
            page.getByRole('heading', { name: 'Available Features' }),
        ).toBeVisible({ timeout: 5000 })
    })

    test('displays global toggles section for developers', async ({ page }) => {
        await page.unroute('**/api/auth/status')
        await page.route('**/api/auth/status', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    authenticated: true,
                    user: {
                        id: '123456789012345678',
                        username: 'testuser',
                        globalName: 'Test User',
                        isDeveloper: true,
                    },
                }),
            })
        })

        await mockGlobalToggles(page)
        await page.route('**/api/toggles/global', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ toggles: {} }),
            })
        })

        await navigateToFeatures(page)
        await waitForFeatures(page)

        // Global toggles moved to /admin; the features page marks them as
        // managed globally on each card instead of rendering a section.
        await expect(page.getByLabel('Global feature').first()).toBeVisible({
            timeout: 5000,
        })
    })

    test('feature switches reflect server toggles and are read-only', async ({
        page,
    }) => {
        await navigateToFeatures(page)
        await waitForFeatures(page)

        const expected: Record<string, string> = {
            'Toggle Music Recommendations': 'true',
            'Toggle Autoplay': 'true',
            'Toggle Lyrics': 'false',
        }
        for (const [name, checked] of Object.entries(expected)) {
            const toggle = page.getByRole('switch', { name })
            await expect(toggle).toHaveAttribute('aria-checked', checked)
            await expect(toggle).toBeDisabled()
        }
    })

    test('server selector chip links to the server list', async ({ page }) => {
        await navigateToFeatures(page)
        await waitForFeatures(page)

        await getServerSelector(page).click()

        await expect(page).toHaveURL(/\/servers/)
    })

    test('keeps the sidebar and active server on the features page', async ({
        page,
    }) => {
        await navigateToFeatures(page)
        await waitForFeatures(page)

        await expect(page.locator('aside').first()).toBeVisible()
        await expect(getServerSelector(page)).toHaveAccessibleName(
            /^Active server: .+\. Click to switch\.$/,
        )
    })

    test('shows loading states during data fetch', async ({ page }) => {
        await page.unroute('**/api/features')
        await page.unroute('**/api/guilds/111111111111111111/features')
        await page.route('**/api/features', async (route) => {
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 1000)
            })
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ features: MOCK_FEATURES }),
            })
        })
        await page.route(
            '**/api/guilds/111111111111111111/features',
            async (route) => {
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, 1000)
                })
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        guildId: '111111111111111111',
                        toggles: {
                            MUSIC_RECOMMENDATIONS: true,
                            AUTOPLAY: true,
                            LYRICS: true,
                            QUEUE_MANAGEMENT: true,
                            REACTION_ROLES: true,
                            ROLE_MANAGEMENT: true,
                        },
                    }),
                })
            },
        )

        await navigateToFeatures(page)

        await expect(page.locator('.animate-pulse').first()).toBeVisible()
        await waitForFeatures(page)
        await expect(
            page
                .locator('#lucky-main-content')
                .getByRole('heading', { name: 'Features', exact: true }),
        ).toBeVisible({ timeout: 10000 })
    })

    test('feature cards display correct information', async ({ page }) => {
        await navigateToFeatures(page)
        await waitForFeatures(page)

        const firstFeature = MOCK_FEATURES[0]
        const featureCard = getFeatureCard(page, firstFeature.name)

        await expect(
            featureCard.getByRole('heading', {
                name: new RegExp(firstFeature.name.replace(/_/g, ' '), 'i'),
            }),
        ).toBeVisible()
    })

    test('badge indicators show the managed state on each card', async ({
        page,
    }) => {
        await navigateToFeatures(page)
        await waitForFeatures(page)

        for (const feature of MOCK_FEATURES) {
            await expect(getFeatureCard(page, feature.name)).toContainText(
                'Managed',
            )
        }
    })

    test('developer-only global toggles are hidden for non-developers', async ({
        page,
    }) => {
        await page.route('**/api/toggles/global', async (route) => {
            await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Forbidden' }),
            })
        })

        await navigateToFeatures(page)
        await waitForFeatures(page)

        await expect(page.locator('text=/Global Toggles/i')).toHaveCount(0)
    })
})
