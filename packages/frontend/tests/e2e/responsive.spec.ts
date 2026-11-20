import { test, expect, type Page } from '@playwright/test'
import { setupMockApiResponses } from './helpers/api-helpers'
import {
    navigateToDashboard,
    navigateToServers,
    navigateToFeatures,
    waitForServerList,
    waitForFeatures,
} from './helpers/page-helpers'
import {
    getServerCard,
    getSidebar,
    getMobileMenuButton,
} from './helpers/ui-helpers'
import { MOCK_GUILDS, MOCK_FEATURES } from './fixtures/test-data'

const VIEWPORTS = [
    { width: 375, height: 667 },
    { width: 768, height: 1024 },
    { width: 1920, height: 1080 },
]

// .lucky-shell clips overflow-x and <main> is the scroll container, so the
// document never grows: content wider than the viewport only shows up as
// <main> scrolling sideways or as elements crossing the viewport edge.
async function expectNoHorizontalOverflow(page: Page): Promise<void> {
    const overflow = await page.evaluate(() => {
        const main = document.querySelector('main')
        if (!main) throw new Error('main scroll container not found')
        const viewport = window.innerWidth
        const escaping = Array.from(main.querySelectorAll('*'))
            .filter((el) => {
                const rect = el.getBoundingClientRect()
                return rect.width > 0 && rect.right > viewport + 1
            })
            .map((el) => `${el.tagName.toLowerCase()}.${el.className}`)
        return {
            document: Math.max(
                0,
                document.documentElement.scrollWidth - viewport,
            ),
            main: main.scrollWidth - main.clientWidth,
            escaping: escaping.slice(0, 5),
        }
    })
    expect(overflow).toEqual({ document: 0, main: 0, escaping: [] })
}

test.describe('Responsive Design', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApiResponses(page)
    })

    test('mobile menu opens and closes the navigation sidebar', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await navigateToDashboard(page)

        const menuButton = page.locator('[aria-controls="mobile-sidebar"]')
        const mobileSidebar = page.locator('#mobile-sidebar')
        await expect(menuButton).toHaveAttribute('aria-expanded', 'false')
        await expect(mobileSidebar).toHaveCount(0)

        await menuButton.click()

        await expect(mobileSidebar).toBeVisible()
        await expect(menuButton).toHaveAttribute('aria-expanded', 'true')
        await expect(
            mobileSidebar.getByRole('link', { name: 'Features' }),
        ).toBeVisible()

        await page.mouse.click(340, 400)

        await expect(mobileSidebar).toHaveCount(0)
        await expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    })

    test('a link in the mobile sidebar navigates and closes it', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await navigateToDashboard(page)

        await page.locator('[aria-controls="mobile-sidebar"]').click()
        await page
            .locator('#mobile-sidebar')
            .getByRole('link', { name: 'Features' })
            .click()

        await expect(page).toHaveURL(/\/features$/)
        await expect(page.locator('#mobile-sidebar')).toHaveCount(0)
    })

    for (const viewport of VIEWPORTS) {
        test(`server list fits a ${viewport.width}px viewport`, async ({
            page,
        }) => {
            await page.setViewportSize(viewport)
            await navigateToServers(page)
            await waitForServerList(page)

            for (const guild of MOCK_GUILDS) {
                await expect(getServerCard(page, guild.name)).toBeVisible()
            }
            await expectNoHorizontalOverflow(page)
        })

        test(`feature cards fit a ${viewport.width}px viewport`, async ({
            page,
        }) => {
            await page.setViewportSize(viewport)
            await navigateToFeatures(page)
            await waitForFeatures(page)

            await expect(page.getByRole('switch')).toHaveCount(
                MOCK_FEATURES.length,
            )
            await expectNoHorizontalOverflow(page)
        })
    }

    test('mobile menu button on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await navigateToDashboard(page)

        const mobileMenuButton = page
            .locator('button[aria-label="Open navigation menu"]')
            .first()
        await expect(mobileMenuButton).toBeVisible({ timeout: 5000 })
    })

    test('navigation accessibility', async ({ page }) => {
        await navigateToDashboard(page)

        const dashboardLink = page.locator('a:has-text("Dashboard")').first()
        await expect(dashboardLink).toBeVisible()

        const featuresLink = page.locator('a:has-text("Features")').first()
        await expect(featuresLink).toBeVisible()
    })

    test('sidebar hidden on mobile by default', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await navigateToDashboard(page)

        await expect(
            page.locator('[aria-controls="mobile-sidebar"]'),
        ).toBeVisible({ timeout: 10000 })
        await expect(page.locator('#mobile-sidebar')).toHaveCount(0)
        await expect(page.locator('aside').first()).toBeHidden()
    })

    for (const width of [360, 390, 768, 1023]) {
        test(`header content clears the menu button at ${width}px`, async ({
            page,
        }) => {
            await page.setViewportSize({ width, height: 800 })
            await navigateToDashboard(page)

            const button = getMobileMenuButton(page)
            await expect(button).toBeVisible()
            const buttonBox = await button.boundingBox()

            const headerChildren = page.locator(
                '.lucky-shell-header > div:first-child > *',
            )
            const count = await headerChildren.count()
            expect(count).toBeGreaterThan(0)
            for (let i = 0; i < count; i++) {
                const box = await headerChildren.nth(i).boundingBox()
                if (!box || !buttonBox) continue
                expect(box.x).toBeGreaterThanOrEqual(
                    buttonBox.x + buttonBox.width,
                )
            }
        })
    }

    test('sidebar links show a focus ring when active and inactive', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await navigateToDashboard(page)

        const links = getSidebar(page).locator('a[data-active]')
        const active = links.locator('xpath=self::*[@data-active="true"]')
        const inactive = links.locator('xpath=self::*[@data-active="false"]')

        const dropShadow = 'rgba(0, 0, 0, 0.18) 0px 8px 24px 0px'

        for (const link of [active.first(), inactive.first()]) {
            await link.focus()
            await page.keyboard.press('Shift+Tab')
            await page.keyboard.press('Tab')
            await expect
                .poll(() =>
                    link.evaluate((el) => getComputedStyle(el).boxShadow),
                )
                .toContain(
                    'rgb(15, 17, 23) 0px 0px 0px 2px, rgb(116, 128, 247) 0px 0px 0px 4px',
                )
        }

        const activeShadow = await active
            .first()
            .evaluate((el) => getComputedStyle(el).boxShadow)
        expect(activeShadow).toContain(dropShadow)
    })
})
