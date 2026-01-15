import { Page, Locator, expect } from '@playwright/test'

export function getServerCard(page: Page, serverName: string): Locator {
    return page
        .locator(`text=${serverName}`)
        .locator('..')
        .locator('..')
        .first()
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
    return page
        .locator(
            'button:has-text("Test Server"), [aria-label*="server"], button:has([class*="avatar"])',
        )
        .first()
}

export function getUserDropdown(page: Page): Locator {
    return page
        .locator('button:has([class*="avatar"]), [aria-label*="user"]')
        .last()
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
    return page.locator('[class*="grid"], [class*="ServerGrid"]').first()
}

export function getSidebar(page: Page): Locator {
    return page.locator('aside, [class*="sidebar"], [class*="Sidebar"]').first()
}

export function getMobileMenuButton(page: Page): Locator {
    return page
        .locator('button:has([class*="Menu"]), button[aria-label*="menu"]')
        .first()
}

export function getLogoutButton(page: Page): Locator {
    return page.locator('text=/Sign Out|Logout|Log out/i').first()
}

export function getAddBotButton(page: Page, serverName: string): Locator {
    const serverCard = getServerCard(page, serverName)
    return serverCard
        .locator('button:has-text("Add Bot"), button:has-text("Invite")')
        .first()
}

export function getManageButton(page: Page, serverName: string): Locator {
    const serverCard = getServerCard(page, serverName)
    return serverCard.locator('button:has-text("Manage")').first()
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
