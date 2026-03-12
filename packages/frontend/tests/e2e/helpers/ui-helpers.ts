import { Page, Locator, expect } from '@playwright/test'

export function getServerCard(page: Page, serverName: string): Locator {
    return page.locator('article', { hasText: serverName }).first()
}

export function getFeatureCard(page: Page, featureName: string): Locator {
    const formattedName = featureName.replace(/_/g, ' ')
    return page
        .locator(`text=/.*${formattedName}.*/i`)
        .locator('..')
        .locator('..')
        .first()
}

export function getServerSelector(page: Page): Locator {
    return page.locator('button[aria-haspopup="listbox"]').first()
}

export function getUserDropdown(page: Page): Locator {
    return page.locator('button:has-text("Logout")').first()
}

export async function verifyToast(
    page: Page,
    message: string,
    timeout = 5000,
): Promise<void> {
    const toast = page.locator(`text=${message}`).first()
    await expect(toast).toBeVisible({ timeout })
}

export function getServerGrid(page: Page): Locator {
    return page.locator('section[aria-labelledby="servers-heading"]').first()
}

export function getSidebar(page: Page): Locator {
    return page.locator('[role="complementary"], aside').first()
}

export function getMobileMenuButton(page: Page): Locator {
    return page.locator('button[aria-label*="menu" i]').first()
}

export function getLogoutButton(page: Page): Locator {
    return page.locator('button:has-text("Logout")').first()
}

export function getAddBotButton(page: Page, serverName: string): Locator {
    return page
        .getByRole('button', {
            name: new RegExp(`^Add bot to ${serverName}$`, 'i'),
        })
        .first()
}

export function getManageButton(page: Page, serverName: string): Locator {
    return page
        .getByRole('button', {
            name: new RegExp(`^Manage ${serverName}$`, 'i'),
        })
        .first()
}

export async function waitForElement(
    page: Page,
    selector: string,
    timeout = 5000,
): Promise<void> {
    await page.waitForSelector(selector, { timeout })
}

export async function verifyBadge(
    page: Page,
    text: string,
    expectedClass?: string,
): Promise<void> {
    const badge = page.locator(`text=${text}`).first()
    await expect(badge).toBeVisible()
    if (expectedClass) {
        await expect(badge).toHaveClass(new RegExp(expectedClass))
    }
}
