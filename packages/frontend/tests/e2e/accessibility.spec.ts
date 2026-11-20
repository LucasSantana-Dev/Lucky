import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { setupMockApiResponses } from './helpers/api-helpers'
import { navigateToDashboard, waitForDashboard } from './helpers/page-helpers'
import { GUILD_STORAGE, mockMusicState } from './helpers/music-state'

const WCAG_TAGS = ['wcag2a', 'wcag2aa']

// Elements with a tracked violation, left out of the scan until the issue
// named next to each selector is fixed. Anything else still fails the test.
const KNOWN_VIOLATIONS: Record<string, string[]> = {
    dashboard: [],
    music: [],
}

async function scan(page: Page, key: keyof typeof KNOWN_VIOLATIONS) {
    let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS)
    for (const selector of KNOWN_VIOLATIONS[key]) {
        builder = builder.exclude(selector)
    }
    const results = await builder.analyze()

    return results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.map((node) => node.target.join(' ')),
    }))
}

test.describe('Accessibility (axe, WCAG 2 A and AA)', () => {
    test.beforeEach(async ({ page }) => {
        // Sections fade in over ~0.6s; axe would sample text mid-fade and
        // report contrast failures that depend on timing, not on the palette.
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await setupMockApiResponses(page)
    })

    test('dashboard has no WCAG A or AA violations', async ({ page }) => {
        await navigateToDashboard(page)
        await waitForDashboard(page)
        await expect(
            page.getByRole('button', { name: /^Active server: / }),
        ).toBeVisible()

        expect(await scan(page, 'dashboard')).toEqual([])
    })

    test('music page has no WCAG A or AA violations', async ({ page }) => {
        await mockMusicState(page)
        await page.addInitScript((guild) => {
            localStorage.setItem('selectedGuild', guild)
        }, GUILD_STORAGE)

        await page.goto('/music')
        await expect(
            page.getByRole('heading', { name: /Music Player/i }).first(),
        ).toBeVisible({ timeout: 10000 })

        expect(await scan(page, 'music')).toEqual([])
    })
})
