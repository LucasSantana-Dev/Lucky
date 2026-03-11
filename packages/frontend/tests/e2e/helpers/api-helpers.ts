import { Page } from '@playwright/test'
import {
    MOCK_API_RESPONSES,
    MOCK_GUILDS,
    MOCK_SERVER_TOGGLES,
} from '../fixtures/test-data'

function parseGuildIdFromRequest(url: string): string | null {
    const pathname = new URL(url).pathname
    const match = pathname.match(/\/api\/guilds\/([^/]+)$/)
    return match?.[1] ?? null
}

export async function mockApiFallback(page: Page): Promise<void> {
    await page.route('**/api/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({}),
        })
    })
}

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

export async function mockGuildDetails(page: Page): Promise<void> {
    await page.route(/\/api\/guilds\/[^/?#]+(?:\?.*)?$/, async (route) => {
        const request = route.request()
        if (request.method() !== 'GET') {
            await route.fallback()
            return
        }

        const guildId = parseGuildIdFromRequest(request.url())
        if (!guildId) {
            await route.fallback()
            return
        }

        const guild = MOCK_GUILDS.find((item) => item.id === guildId)
        if (!guild) {
            await route.fulfill({
                status: 404,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Guild not found' }),
            })
            return
        }

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify(guild),
        })
    })
}

export async function mockGuildMemberContext(page: Page): Promise<void> {
    await page.route('**/api/guilds/*/me', async (route) => {
        const request = route.request()
        const guildId = new URL(request.url()).pathname
            .split('/api/guilds/')[1]
            ?.split('/')[0]
        const guild =
            MOCK_GUILDS.find((item) => item.id === guildId) ?? MOCK_GUILDS[0]

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({
                guildId: guild.id,
                nickname: null,
                username: MOCK_API_RESPONSES.authStatus.user.username,
                globalName: MOCK_API_RESPONSES.authStatus.user.globalName,
                roleIds: ['123456789012345670'],
                effectiveAccess: guild.effectiveAccess,
                canManageRbac: guild.canManageRbac,
            }),
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
    guildId?: string,
): Promise<void> {
    const pattern = guildId
        ? `**/api/guilds/${guildId}/features`
        : '**/api/guilds/*/features'

    await page.route(pattern, async (route) => {
        const matchedGuildId =
            new URL(route.request().url()).pathname
                .split('/api/guilds/')[1]
                ?.split('/')[0] ?? guildId

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({
                guildId: matchedGuildId,
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
        : guildId
          ? `**/api/guilds/${guildId}/features/**`
          : '**/api/guilds/*/features/**'

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

export async function mockGuildSettings(page: Page): Promise<void> {
    await page.route('**/api/guilds/*/settings', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true',
                },
                body: JSON.stringify(MOCK_API_RESPONSES.serverSettings),
            })
            return
        }

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true }),
        })
    })
}

export async function mockGuildListing(page: Page): Promise<void> {
    await page.route('**/api/guilds/*/listing', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true',
                },
                body: JSON.stringify(MOCK_API_RESPONSES.serverListing),
            })
            return
        }

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true }),
        })
    })
}

export async function mockGuildRbac(page: Page): Promise<void> {
    await page.route('**/api/guilds/*/rbac', async (route) => {
        const request = route.request()
        const guildId =
            new URL(request.url()).pathname
                .split('/api/guilds/')[1]
                ?.split('/')[0] ?? '111111111111111111'

        if (request.method() === 'PUT') {
            const payload = request.postDataJSON() as { grants?: unknown[] }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true',
                },
                body: JSON.stringify({
                    success: true,
                    grants: payload?.grants ?? [],
                }),
            })
            return
        }

        const guild =
            MOCK_GUILDS.find((item) => item.id === guildId) ?? MOCK_GUILDS[0]
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({
                guildId,
                modules: [
                    'overview',
                    'settings',
                    'moderation',
                    'automation',
                    'music',
                    'integrations',
                ],
                grants: [],
                roles: [
                    { id: 'role-1', name: 'Moderator' },
                    { id: 'role-2', name: 'Manager' },
                ],
                effectiveAccess: guild.effectiveAccess,
                canManageRbac: guild.canManageRbac ?? false,
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

export async function mockModeration(page: Page): Promise<void> {
    await page.route('**/api/guilds/*/moderation/stats', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({
                stats: {
                    totalCases: 12,
                    activeCases: 2,
                    casesByType: {
                        warn: 5,
                        mute: 3,
                        kick: 2,
                        ban: 2,
                        unmute: 0,
                        unban: 0,
                    },
                    recentCases: [],
                },
            }),
        })
    })

    await page.route('**/api/guilds/*/moderation/cases**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({
                total: 0,
                cases: [],
            }),
        })
    })
}

export async function mockAutoMod(page: Page): Promise<void> {
    await page.route('**/api/guilds/*/automod/settings', async (route) => {
        const method = route.request().method()

        if (method === 'PATCH') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    settings: route.request().postDataJSON(),
                }),
            })
            return
        }

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({
                settings: {
                    id: 'automod-1',
                    guildId: '111111111111111111',
                    enabled: true,
                    spamEnabled: true,
                    spamThreshold: 5,
                    spamTimeWindow: 5,
                    capsEnabled: true,
                    capsThreshold: 70,
                    linksEnabled: true,
                    allowedDomains: ['youtube.com'],
                    invitesEnabled: true,
                    wordsEnabled: false,
                    bannedWords: [],
                    exemptChannels: [],
                    exemptRoles: [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            }),
        })
    })
}

export async function mockCommands(page: Page): Promise<void> {
    await page.route('**/api/guilds/*/commands', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({
                commands: [
                    {
                        id: 'cmd-1',
                        name: 'ping',
                        description: 'Check bot latency',
                        category: 'Info',
                        enabled: true,
                    },
                    {
                        id: 'cmd-2',
                        name: 'warn',
                        description: 'Warn a member',
                        category: 'Moderator',
                        enabled: true,
                    },
                ],
            }),
        })
    })
}

export async function mockTrackHistory(page: Page): Promise<void> {
    await page.route('**/api/guilds/*/music/history**', async (route) => {
        const method = route.request().method()
        const url = route.request().url()

        if (method === 'DELETE') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            })
            return
        }

        if (url.includes('/stats')) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': 'true',
                },
                body: JSON.stringify({
                    stats: {
                        totalTracks: 42,
                        totalPlayTime: 7200,
                        topArtists: [{ artist: 'Queen', plays: 15 }],
                        topTracks: [
                            {
                                trackId: 'track-1',
                                title: 'Bohemian Rhapsody',
                                plays: 7,
                            },
                        ],
                        lastUpdated: new Date().toISOString(),
                    },
                }),
            })
            return
        }

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({
                history: [
                    {
                        trackId: 'track-1',
                        title: 'Bohemian Rhapsody',
                        author: 'Queen',
                        duration: '5:55',
                        url: 'https://youtube.com/watch?v=abc',
                        timestamp: Date.now() - 120000,
                    },
                ],
            }),
        })
    })
}

export async function mockTwitchNotifications(page: Page): Promise<void> {
    await page.route('**/api/guilds/*/twitch/notifications', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify({
                notifications: [
                    {
                        id: 'notif-1',
                        guildId: '111111111111111111',
                        twitchUserId: '12345',
                        twitchLogin: 'shroud',
                        discordChannelId: '999888777666555444',
                    },
                ],
            }),
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
    await mockApiFallback(page)
    await mockAuthStatus(page, true)
    await mockGuildsList(page)
    await mockGuildDetails(page)
    await mockGuildMemberContext(page)
    await mockGuildSettings(page)
    await mockGuildListing(page)
    await mockGuildRbac(page)
    await mockFeaturesList(page)
    await mockGlobalToggles(page)
    await mockServerToggles(page)
    await mockToggleUpdate(page, false)
    await mockToggleUpdate(page, true)
    await mockModeration(page)
    await mockAutoMod(page)
    await mockCommands(page)
    await mockTrackHistory(page)
    await mockTwitchNotifications(page)
}
