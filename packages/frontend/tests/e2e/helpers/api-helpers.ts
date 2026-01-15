import { Page } from '@playwright/test'
import {
    MOCK_API_RESPONSES,
    MOCK_GUILDS,
    MOCK_FEATURES,
    MOCK_GLOBAL_TOGGLES,
    MOCK_SERVER_TOGGLES,
} from '../fixtures/test-data'

export async function mockGuildsList(page: Page): Promise<void> {
    await page.route('**/api/guilds', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify(MOCK_API_RESPONSES.guildsList),
        })
    })
}

export async function mockFeaturesList(page: Page): Promise<void> {
    await page.route('**/api/features', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify(MOCK_API_RESPONSES.featuresList),
        })
    })
}

export async function mockGlobalToggles(page: Page): Promise<void> {
    await page.route('**/api/toggles/global', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify(MOCK_API_RESPONSES.globalToggles),
        })
    })
}

export async function mockServerToggles(
    page: Page,
    guildId: string,
): Promise<void> {
    await page.route(`**/api/guilds/${guildId}/features`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({
                guildId,
                toggles: MOCK_SERVER_TOGGLES,
            }),
        })
    })
}

export async function mockToggleUpdate(
    page: Page,
    isGlobal: boolean,
    guildId?: string,
): Promise<void> {
    const pattern = isGlobal
        ? '**/api/toggles/global/**'
        : `**/api/guilds/${guildId}/features/**`

    await page.route(pattern, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({ success: true }),
        })
    })
}

export async function mockServerSettings(
    page: Page,
    guildId: string,
): Promise<void> {
    await page.route(`**/api/guilds/${guildId}/settings`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify(MOCK_API_RESPONSES.serverSettings),
        })
    })
}

export async function mockAuthStatus(
    page: Page,
    authenticated = true,
): Promise<void> {
    await page.route('**/api/auth/status', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify(
                authenticated
                    ? MOCK_API_RESPONSES.authStatus
                    : { authenticated: false },
            ),
        })
    })
}

export async function mockInviteUrl(
    page: Page,
    guildId: string,
): Promise<void> {
    await page.route(`**/api/guilds/${guildId}/invite`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify(MOCK_API_RESPONSES.inviteUrl),
        })
    })
}

export async function interceptApiCalls(
    page: Page,
): Promise<Map<string, unknown[]>> {
    const apiCalls = new Map<string, unknown[]>()

    page.on('request', (request) => {
        const url = request.url()
        if (url.includes('/api/')) {
            const endpoint = url.split('/api/')[1].split('?')[0]
            if (!apiCalls.has(endpoint)) {
                apiCalls.set(endpoint, [])
            }
            apiCalls.get(endpoint)?.push({
                method: request.method(),
                url: request.url(),
                headers: request.headers(),
            })
        }
    })

    return apiCalls
}

export async function setupMockApiResponses(page: Page): Promise<void> {
    await mockAuthStatus(page, true)
    await mockGuildsList(page)
    await mockFeaturesList(page)
    await mockGlobalToggles(page)
    await mockServerToggles(page, '111111111111111111')
    await mockToggleUpdate(page, false, '111111111111111111')
    await mockToggleUpdate(page, true)
}
