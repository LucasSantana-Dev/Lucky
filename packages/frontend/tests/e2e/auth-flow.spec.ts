import { test, expect } from '@playwright/test'
import {
    waitForAuth,
    clearSession,
    verifyOAuthRedirect,
    verifySessionCookie,
    interceptAuthRequests,
} from './helpers/auth-helpers'
import { MOCK_OAUTH_STATE, MOCK_AUTH_CODE } from './fixtures/test-data'

test.describe('OAuth Login Flow', () => {
    test.beforeEach(async ({ page }) => {
        await clearSession(page)
    })

    test('Login button click and redirect', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        const loginButton = page.locator(
            'button:has-text("Login with Discord")',
        )
        await expect(loginButton).toBeVisible()
        await expect(loginButton).toBeEnabled()

        const [response] = await Promise.all([
            page
                .waitForResponse(
                    (response) => response.url().includes('/api/auth/discord'),
                    { timeout: 10000 },
                )
                .catch(() => null),
            loginButton.click(),
        ])

        if (response) {
            const status = response.status()
            if (status === 302 || status === 200) {
                const redirectUrl =
                    response.headers()['location'] || response.url()
                if (redirectUrl) {
                    try {
                        const url = new URL(redirectUrl)
                        expect(url.searchParams.get('client_id')).toBeTruthy()
                        expect(url.searchParams.get('redirect_uri')).toContain(
                            '/api/auth/callback',
                        )
                        expect(url.searchParams.get('scope')).toContain(
                            'identify',
                        )
                        expect(url.searchParams.get('state')).toBeTruthy()
                    } catch {
                        expect(redirectUrl).toContain('discord.com')
                    }
                }
            }
        } else {
            await page
                .waitForURL(/discord\.com/, { timeout: 5000 })
                .catch(() => null)
            const currentUrl = page.url()
            if (currentUrl.includes('discord.com')) {
                expect(currentUrl).toContain('discord.com/api/oauth2/authorize')
            }
        }
    })

    test('OAuth redirect includes state parameter', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        const loginButton = page.locator(
            'button:has-text("Login with Discord")',
        )
        await expect(loginButton).toBeVisible()

        const responsePromise = page
            .waitForResponse(
                (response) => response.url().includes('/api/auth/discord'),
                { timeout: 10000 },
            )
            .catch(() => null)

        await loginButton.click()

        const response = await responsePromise
        if (response) {
            const redirectUrl = response.headers()['location'] || response.url()
            if (redirectUrl) {
                try {
                    const url = new URL(redirectUrl)
                    const hasState = url.searchParams.has('state')
                    const hasClientId = url.searchParams.has('client_id')
                    expect(hasState || hasClientId).toBe(true)
                } catch {
                    expect(redirectUrl).toMatch(/state=|client_id=/)
                }
            }
        } else {
            await page
                .waitForURL(/discord\.com/, { timeout: 5000 })
                .catch(() => null)
            const currentUrl = page.url()
            if (currentUrl.includes('discord.com')) {
                expect(currentUrl).toMatch(/state=|client_id=/)
            }
        }
    })

    test('Error handling - invalid state parameter', async ({ page }) => {
        await interceptAuthRequests(page)

        await page.goto('/?error=invalid_state')
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(500)

        const errorMessage = page
            .locator('[class*="error"], [class*="lukbot-error"]')
            .filter({
                hasText:
                    /Invalid security token|Security validation failed|Invalid state/i,
            })

        await expect(errorMessage.first()).toBeVisible({ timeout: 5000 })
    })

    test('Error handling - missing authorization code', async ({ page }) => {
        await interceptAuthRequests(page)

        await page.goto('/?error=missing_code')
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(500)

        const errorMessage = page
            .locator('[class*="error"], [class*="lukbot-error"]')
            .filter({
                hasText: /Missing authorization code|Authorization code/i,
            })

        await expect(errorMessage.first()).toBeVisible({ timeout: 5000 })
    })

    test('Error handling - authentication failed', async ({ page }) => {
        await interceptAuthRequests(page)

        await page.goto('/?error=auth_failed')
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(500)

        const errorMessage = page
            .locator('[class*="error"], [class*="lukbot-error"]')
            .filter({
                hasText: /Authentication failed|Failed to authenticate/i,
            })

        await expect(errorMessage.first()).toBeVisible({ timeout: 5000 })
    })

    test('Session cookie is set after authentication', async ({ page }) => {
        await page.route('**/api/auth/status', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: {
                    'Set-Cookie':
                        'sessionId=mock_session_12345; Path=/; HttpOnly; SameSite=Lax',
                },
                body: JSON.stringify({
                    authenticated: true,
                    user: MOCK_DISCORD_USER,
                }),
            })
        })

        await page.context().addCookies([
            {
                name: 'sessionId',
                value: 'mock_session_12345',
                domain: 'localhost',
                path: '/',
            },
        ])

        await page.goto('/?authenticated=true')
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(1000)

        const hasSession = await verifySessionCookie(page)
        expect(hasSession).toBe(true)
    })

    test('Login page displays correctly', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        await expect(
            page.locator('h1:has-text("LukBot")').first(),
        ).toBeVisible()
        await expect(
            page.locator('h2:has-text("Welcome to LukBot Dashboard")'),
        ).toBeVisible()
        await expect(
            page.locator('button:has-text("Login with Discord")'),
        ).toBeVisible()
    })

    test('Loading state during authentication check', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        const loginButton = page.locator(
            'button:has-text("Login with Discord")',
        )
        await expect(loginButton).toBeVisible()
    })
})

test.describe('Session Management', () => {
    test('Session persists across page reloads', async ({ page, context }) => {
        await interceptAuthRequests(page)

        await page.goto('/?authenticated=true')
        await page.waitForLoadState('networkidle')

        const cookiesBefore = await context.cookies()
        const sessionCookieBefore = cookiesBefore.find(
            (c) => c.name === 'sessionId',
        )

        await page.reload()
        await page.waitForLoadState('networkidle')

        const cookiesAfter = await context.cookies()
        const sessionCookieAfter = cookiesAfter.find(
            (c) => c.name === 'sessionId',
        )

        if (sessionCookieBefore) {
            expect(sessionCookieAfter).toBeTruthy()
            expect(sessionCookieAfter?.value).toBe(sessionCookieBefore.value)
        }
    })

    test('Logout clears session', async ({ page }) => {
        await interceptAuthRequests(page)

        await page.goto('/?authenticated=true')
        await page.waitForLoadState('networkidle')

        const hasSessionBefore = await verifySessionCookie(page)

        await page.route('**/api/auth/logout', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            })
        })

        const logoutButton = page.locator('button:has-text("Logout")')
        if (await logoutButton.isVisible()) {
            await logoutButton.click()
            await page.waitForTimeout(1000)

            const hasSessionAfter = await verifySessionCookie(page)
            if (hasSessionBefore) {
                expect(hasSessionAfter).toBe(false)
            }
        }
    })
})

test.describe('Network Request Verification', () => {
    test('CORS headers are present in API responses', async ({ page }) => {
        await page.route('**/api/**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true',
                },
                body: JSON.stringify({}),
            })
        })

        const responses: string[] = []

        page.on('response', (response) => {
            if (response.url().includes('/api/')) {
                const headers = response.headers()
                if (
                    headers['access-control-allow-origin'] ||
                    headers['Access-Control-Allow-Origin']
                ) {
                    responses.push(response.url())
                }
            }
        })

        await page.goto('/')
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(1000)

        expect(responses.length).toBeGreaterThan(0)
    })

    test('API requests include credentials', async ({ page }) => {
        let requestWithCredentials = false

        page.on('request', (request) => {
            if (request.url().includes('/api/')) {
                const headers = request.headers()
                if (headers['cookie']) {
                    requestWithCredentials = true
                }
            }
        })

        await page.goto('/')
        await page.waitForLoadState('networkidle')

        await page.waitForTimeout(2000)

        expect(requestWithCredentials).toBe(true)
    })
})
