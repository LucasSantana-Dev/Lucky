import { test, expect } from '@playwright/test'

test.describe('Visual Regression - Login Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 })
        await page.route('**/api/auth/status', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ authenticated: false }),
            })
        })
        await page.route('**/api/auth/discord', async (route) => {
            await route.fulfill({
                status: 302,
                headers: {
                    location:
                        'https://discord.com/api/oauth2/authorize?client_id=test&redirect_uri=http%3A%2F%2Flocalhost%2Fapi%2Fauth%2Fcallback',
                },
                body: '',
            })
        })
    })

    test('Login page screenshot', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')

        await expect(page).toHaveScreenshot('login-page.png', {
            fullPage: true,
            maxDiffPixels: 100,
        })
    })

    test('Login page with error query params', async ({ page }) => {
        await page.goto('/?error=auth_failed&message=test_error')
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(500)

        await expect(page).toHaveScreenshot('login-page-error.png', {
            fullPage: true,
            maxDiffPixels: 100,
        })
    })

    test('Login button hover state', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')

        const loginButton = page.locator(
            'button:has-text("Login with Discord")',
        )
        await loginButton.hover()
        await page.waitForTimeout(500)

        await expect(loginButton).toHaveScreenshot('login-button-hover.png', {
            maxDiffPixels: 50,
        })
    })

    test('Login button loading state', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')

        const loginButton = page.locator(
            'button:has-text("Login with Discord")',
        )

        await page.unroute('**/api/auth/discord')
        await page.route('**/api/auth/discord', async (route) => {
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 1000)
            })
            await route.fulfill({
                status: 302,
                headers: {
                    location:
                        'https://discord.com/api/oauth2/authorize?client_id=test&redirect_uri=http%3A%2F%2Flocalhost%2Fapi%2Fauth%2Fcallback',
                },
                body: '',
            })
        })

        await loginButton.click()
        await page.waitForTimeout(500)

        const loadingButton = page.locator('button:has-text("Connecting")')
        if (await loadingButton.isVisible()) {
            await expect(loadingButton).toHaveScreenshot(
                'login-button-loading.png',
                {
                    maxDiffPixels: 50,
                },
            )
        }
    })
})
