import { Page, expect } from '@playwright/test'

export async function navigateToServers(page: Page): Promise<void> {
    await page.goto('/servers')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('body', { state: 'visible' })
}

export async function navigateToDashboard(page: Page): Promise<void> {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('body', { state: 'visible' })
}

export async function navigateToFeatures(page: Page): Promise<void> {
    await page.goto('/features')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('body', { state: 'visible' })
}

export async function selectServer(
    page: Page,
    serverId: string,
): Promise<void> {
    const serverSelector = page.locator('button[aria-haspopup="listbox"]').first()
    await serverSelector.click()

    const serverOption = page
        .locator(`[data-server-id="${serverId}"], text="${serverId}"`)
        .first()
    if (await serverOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await serverOption.click()
    } else {
        const dropdownItem = page
            .locator(`text=/.*${serverId.substring(0, 10)}.*/`)
            .first()
        await dropdownItem.click()
    }

    await page.waitForTimeout(500)
}

export async function toggleFeature(
    page: Page,
    featureName: string,
    enabled: boolean,
): Promise<void> {
    const featureCard = page
        .locator(
            `[data-feature="${featureName}"], :has-text("${featureName.replace(/_/g, ' ')}")`,
        )
        .first()
    const switchButton = featureCard
        .locator('button[role="switch"], [role="switch"]')
        .first()

    const currentState = await switchButton.getAttribute('aria-checked')
    const shouldToggle = currentState !== String(enabled)

    if (shouldToggle) {
        await switchButton.click()
        await page.waitForTimeout(500)
    }
}

export async function waitForServerList(
    page: Page,
    timeout = 10000,
): Promise<void> {
    await page.waitForSelector('main section[aria-labelledby="servers-heading"]', {
        timeout,
    })
    await page.waitForLoadState('domcontentloaded')
}

export async function waitForFeatures(
    page: Page,
    timeout = 10000,
): Promise<void> {
    await page
        .locator('main')
        .getByRole('heading', { name: 'Features' })
        .first()
        .waitFor({
            state: 'visible',
            timeout,
        })
    await page.waitForLoadState('domcontentloaded')
}

export async function waitForDashboard(
    page: Page,
    timeout = 10000,
): Promise<void> {
    await page
        .locator('main')
        .getByRole('heading', {
            name: /Dashboard|Select a Server|No Server Selected/i,
        })
        .first()
        .waitFor({
            state: 'visible',
            timeout,
        })
    await page.waitForLoadState('domcontentloaded')
}
