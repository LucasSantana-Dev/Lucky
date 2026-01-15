import { Page, expect } from '@playwright/test'
import {
    MOCK_DISCORD_USER,
    MOCK_OAUTH_STATE,
    MOCK_AUTH_CODE,
} from '../fixtures/test-data'

export async function waitForAuth(page: Page, timeout = 10000): Promise<void> {
    await page.waitForURL(/\/servers/, { timeout })
    await expect(page.locator('text=Servers')).toBeVisible({ timeout: 5000 })
}

export async function clearSession(page: Page): Promise<void> {
    await page.context().clearCookies()
    try {
        await page.evaluate(() => {
            if (typeof localStorage !== 'undefined') {
                localStorage.clear()
            }
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.clear()
            }
        })
    } catch {
        // Ignore localStorage access errors in some contexts
    }
}

export async function getAuthState(page: Page): Promise<{
    isAuthenticated: boolean
    user: unknown
}> {
    return await page.evaluate(() => {
        const authData = localStorage.getItem('auth')
        if (authData) {
            return JSON.parse(authData)
        }
        return { isAuthenticated: false, user: null }
    })
}

export async function mockDiscordCallback(
    page: Page,
    code: string = MOCK_AUTH_CODE,
    state: string = MOCK_OAUTH_STATE,
): Promise<void> {
    await page.route('**/api/auth/callback*', async (route) => {
        const url = new URL(route.request().url())
        const existingCode = url.searchParams.get('code')
        const existingState = url.searchParams.get('state')

        if (existingCode && existingState) {
            await route.continue()
        } else {
            url.searchParams.set('code', code)
            url.searchParams.set('state', state)
            await route.continue({ url: url.toString() })
        }
    })
}

export async function interceptAuthRequests(page: Page): Promise<void> {
    await page.route('**/api/auth/status', async (route) => {
        try {
            const response = await route.fetch()
            const text = await response.text()

            if (!text) {
                await route.continue()
                return
            }

            let data
            try {
                data = JSON.parse(text)
            } catch {
                await route.continue()
                return
            }

            if (data.authenticated) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        authenticated: true,
                        user: MOCK_DISCORD_USER,
                    }),
                })
            } else {
                await route.continue()
            }
        } catch {
            await route.continue()
        }
    })
}

export async function verifyOAuthRedirect(page: Page): Promise<{
    hasState: boolean
    hasClientId: boolean
    hasRedirectUri: boolean
    hasScope: boolean
}> {
    try {
        const response = await page.waitForResponse(
            (response) => response.url().includes('/api/auth/discord'),
            { timeout: 5000 },
        )

        const redirectUrl = response.headers()['location'] || response.url()

        if (!redirectUrl) {
            return {
                hasState: false,
                hasClientId: false,
                hasRedirectUri: false,
                hasScope: false,
            }
        }

        try {
            const url = new URL(redirectUrl)
            return {
                hasState: url.searchParams.has('state'),
                hasClientId:
                    url.searchParams.get('client_id') === '962198089161134131',
                hasRedirectUri:
                    url.searchParams
                        .get('redirect_uri')
                        ?.includes('/api/auth/callback') ?? false,
                hasScope:
                    url.searchParams.get('scope')?.includes('identify') ??
                    false,
            }
        } catch {
            return {
                hasState: redirectUrl.includes('state='),
                hasClientId: redirectUrl.includes('client_id='),
                hasRedirectUri: redirectUrl.includes('/api/auth/callback'),
                hasScope: redirectUrl.includes('scope='),
            }
        }
    } catch {
        const currentUrl = page.url()
        return {
            hasState: currentUrl.includes('state='),
            hasClientId: currentUrl.includes('client_id='),
            hasRedirectUri: currentUrl.includes('/api/auth/callback'),
            hasScope: currentUrl.includes('scope='),
        }
    }
}

export async function verifySessionCookie(page: Page): Promise<boolean> {
    const cookies = await page.context().cookies()
    return cookies.some(
        (cookie) => cookie.name === 'sessionId' && cookie.value.length > 0,
    )
}

export async function waitForNetworkIdle(
    page: Page,
    timeout = 5000,
): Promise<void> {
    await page.waitForLoadState('networkidle', { timeout })
}
