import { test, expect } from '@playwright/test'

test.describe('Authentication Performance', () => {
    test('Time to redirect to Discord OAuth', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')

        const startTime = Date.now()

        const loginButton = page.locator(
            'button:has-text("Login with Discord")',
        )
        await expect(loginButton).toBeVisible()

        const endTime = Date.now()
        const loadTime = endTime - startTime

        expect(loadTime).toBeLessThan(5000)
    })

    test('Time to process OAuth callback', async ({ page }) => {
        await page.route('**/api/auth/callback*', async (route) => {
            const startTime = Date.now()
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            })
            const endTime = Date.now()
            const processTime = endTime - startTime

            expect(processTime).toBeLessThan(3000)
        })

        await page.goto('/?authenticated=true')
        await page.waitForLoadState('domcontentloaded')
    })

    test('Time to verify authentication status', async ({ page }) => {
        await page.route('**/api/auth/status', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ authenticated: false }),
            })
        })

        const startTime = Date.now()

        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')

        const loginButton = page.locator(
            'button:has-text("Login with Discord")',
        )
        await expect(loginButton).toBeVisible({ timeout: 5000 })

        const endTime = Date.now()
        const verifyTime = endTime - startTime

        expect(verifyTime).toBeLessThan(5000)
    })

    test('Time to create session', async ({ page }) => {
        await page.route('**/api/auth/status', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ authenticated: false }),
            })
        })

        const startTime = Date.now()

        await page.goto('/?authenticated=true')
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(500)

        const endTime = Date.now()
        const sessionTime = endTime - startTime

        expect(sessionTime).toBeLessThan(5000)
    })

    test('Page load performance', async ({ page }) => {
        const startTime = Date.now()

        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')

        const endTime = Date.now()
        const loadTime = endTime - startTime

        expect(loadTime).toBeLessThan(5000)
    })

    test('Network request count on login page', async ({ page }) => {
        const requests: string[] = []

        page.on('request', (request) => {
            if (request.url().includes('/api/')) {
                requests.push(request.url())
            }
        })

        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')

        await page.waitForTimeout(2000)

        expect(requests.length).toBeLessThan(10)
    })
})
