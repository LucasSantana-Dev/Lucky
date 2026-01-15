import { test, expect } from '@playwright/test'

test.describe('Visual Regression - Login Page', () => {
    test('Login page screenshot', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        await expect(page).toHaveScreenshot('login-page.png', {
            fullPage: true,
            maxDiffPixels: 100,
        })
    })

    test('Login page with error message', async ({ page }) => {
        await page.goto('/?error=auth_failed&message=test_error')
        await page.waitForLoadState('networkidle')

        const errorContainer = page
            .locator('[class*="error"], [class*="Error"]')
            .first()
        await expect(errorContainer).toBeVisible({ timeout: 5000 })

        await expect(page).toHaveScreenshot('login-page-error.png', {
            fullPage: true,
            maxDiffPixels: 100,
        })
    })

    test('Login button hover state', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

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
        await page.waitForLoadState('networkidle')

        const loginButton = page.locator(
            'button:has-text("Login with Discord")',
        )

        await page.route('**/api/auth/discord', async (route) => {
            await page.waitForTimeout(1000)
            await route.continue()
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
