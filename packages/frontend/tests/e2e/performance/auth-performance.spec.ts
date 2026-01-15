import { test, expect } from '@playwright/test'
import { verifyOAuthRedirect } from '../helpers/auth-helpers'

test.describe('Authentication Performance', () => {
    test('Time to redirect to Discord OAuth', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        const startTime = Date.now()

        const loginButton = page.locator(
            'button:has-text("Login with Discord")',
        )
        const [response] = await Promise.all([
            page.waitForResponse(
                (response) => response.url().includes('/api/auth/discord'),
                {
                    timeout: 10000,
                },
            ),
            loginButton.click(),
        ])

        const endTime = Date.now()
        const redirectTime = endTime - startTime

        expect(response.status()).toBe(302)
        expect(redirectTime).toBeLessThan(2000)
    })

    test('Time to process OAuth callback', async ({ page }) => {
        await page.route('**/api/auth/callback*', async (route) => {
            const startTime = Date.now()
            await route.continue()
            const endTime = Date.now()
            const processTime = endTime - startTime

            expect(processTime).toBeLessThan(3000)
        })

        await page.goto('/?authenticated=true')
        await page.waitForLoadState('networkidle')
    })

    test('Time to verify authentication status', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        const startTime = Date.now()

        const response = await page.waitForResponse(
            (response) => response.url().includes('/api/auth/status'),
            { timeout: 5000 },
        )

        const endTime = Date.now()
        const verifyTime = endTime - startTime

        expect(response.status()).toBe(200)
        expect(verifyTime).toBeLessThan(1000)
    })

    test('Time to create session', async ({ page }) => {
        await page.goto('/?authenticated=true')
        await page.waitForLoadState('networkidle')

        const startTime = Date.now()

        await page.waitForResponse(
            (response) =>
                response.url().includes('/api/auth/status') &&
                response.status() === 200,
            { timeout: 5000 },
        )

        const endTime = Date.now()
        const sessionTime = endTime - startTime

        expect(sessionTime).toBeLessThan(2000)
    })

    test('Page load performance', async ({ page }) => {
        const startTime = Date.now()

        await page.goto('/')
        await page.waitForLoadState('networkidle')

        const endTime = Date.now()
        const loadTime = endTime - startTime

        expect(loadTime).toBeLessThan(3000)
    })

    test('Network request count on login page', async ({ page }) => {
        const requests: string[] = []

        page.on('request', (request) => {
            if (request.url().includes('/api/')) {
                requests.push(request.url())
            }
        })

        await page.goto('/')
        await page.waitForLoadState('networkidle')

        await page.waitForTimeout(2000)

        expect(requests.length).toBeLessThan(10)
    })
})
