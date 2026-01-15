import { test as base } from '@playwright/test'
import type { Page } from '@playwright/test'

type TestFixtures = {
    authenticatedPage: Page
}

export const test = base.extend<TestFixtures>({
    authenticatedPage: async ({ page }, use) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        const loginButton = page.locator(
            'button:has-text("Login with Discord")',
        )
        if (await loginButton.isVisible()) {
            await page.evaluate(() => {
                localStorage.setItem(
                    'auth',
                    JSON.stringify({
                        isAuthenticated: true,
                        user: {
                            id: '123456789012345678',
                            username: 'testuser',
                            discriminator: '0001',
                            avatar: 'a_1234567890abcdef',
                        },
                    }),
                )
            })

            await page.reload()
            await page.waitForURL(/\/servers/, { timeout: 10000 })
        }

        await use(page)
    },
})

export { expect } from '@playwright/test'
