import { test as base } from '@playwright/test'
import type { Page } from '@playwright/test'

type TestFixtures = {
    authenticatedPage: Page
}

export const test = base.extend<TestFixtures>({
    authenticatedPage: async ({ page }, use) => {
        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')

        const loginButton = page.locator(
            'button:has-text("Login with Discord")',
        )
        if (await loginButton.isVisible()) {
            await page.evaluate(() => {
                localStorage.setItem(
                    'lucky-auth',
                    JSON.stringify({
                        state: {
                            isAuthenticated: true,
                            isDeveloper: false,
                            user: {
                                id: '123456789012345678',
                                username: 'testuser',
                                globalName: 'Test User',
                                avatar: 'a_1234567890abcdef',
                            },
                        },
                        version: 0,
                    }),
                )
            })

            await page.reload()
            await page.waitForURL(/\/$/, { timeout: 10000 })
        }

        await use(page)
    },
})

export { expect } from '@playwright/test'
