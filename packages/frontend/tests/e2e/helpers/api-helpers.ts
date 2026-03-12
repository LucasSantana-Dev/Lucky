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

export async function mockGuildMemberContext(
    page: Page,
    guildId: string,
): Promise<void> {
    await page.route(`**/api/guilds/${guildId}/me`, async (route) => {
        const guild = MOCK_GUILDS.find((item) => item.id === guildId)
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({
                guildId,
                nickname: null,
                username: MOCK_API_RESPONSES.authUser.username,
                globalName: null,
                roleIds: [],
                effectiveAccess:
                    guild?.effectiveAccess ??
                    {
                        overview: 'none',
                        settings: 'none',
                        moderation: 'none',
                        automation: 'none',
                        music: 'none',
                        integrations: 'none',
                    },
                canManageRbac: Boolean(guild?.canManageRbac),
            }),
        })
    })
}

export async function mockModerationStats(
    page: Page,
    guildId: string,
): Promise<void> {
    await page.route(`**/api/guilds/${guildId}/moderation/stats`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({
                stats: {
                    totalCases: 0,
                    activeCases: 0,
                    recentCases: 0,
                    casesByType: {
                        warn: 0,
                        mute: 0,
                        kick: 0,
                        ban: 0,
                    },
                },
            }),
        })
    })
}

export async function mockModerationCases(
    page: Page,
    guildId: string,
): Promise<void> {
    await page.route(`**/api/guilds/${guildId}/moderation/cases*`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({
                cases: [],
                total: 0,
            }),
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
    for (const guild of MOCK_GUILDS) {
        await mockGuildMemberContext(page, guild.id)
        await mockServerSettings(page, guild.id)
        await mockModerationStats(page, guild.id)
        await mockModerationCases(page, guild.id)
        await mockServerToggles(page, guild.id)
        await mockToggleUpdate(page, false, guild.id)
    }
    await mockToggleUpdate(page, true)
}
