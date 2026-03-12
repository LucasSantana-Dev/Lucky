import { describe, test, expect, vi, beforeEach } from 'vitest'
import { useGuildStore } from './guildStore'
import type { Guild, GuildMemberContext, ServerSettings } from '@/types'
import { ApiError } from '@/services/ApiError'

vi.mock('@/services/api', () => ({
    api: {
        guilds: {
            list: vi.fn(),
            getMe: vi.fn(),
            getSettings: vi.fn(),
        },
    },
}))

import { api } from '@/services/api'

const mockGuild = (overrides?: Partial<Guild>): Guild => ({
    id: '123456789012345678',
    name: 'Test Server',
    icon: null,
    owner: false,
    permissions: '8',
    features: [],
    botAdded: true,
    ...overrides,
})

const MANAGE_ACCESS = {
    overview: 'manage',
    settings: 'manage',
    moderation: 'manage',
    automation: 'manage',
    music: 'manage',
    integrations: 'manage',
} as const

type MeResponse = { data: GuildMemberContext }
type SettingsResponse = { data: { settings: ServerSettings | null } }

function setupSelectedGuildApiMocks(guildId: string) {
    vi.mocked(api.guilds.getSettings).mockResolvedValue({
        data: { settings: null },
    } as never)
    vi.mocked(api.guilds.getMe).mockResolvedValue({
        data: {
            guildId,
            nickname: null,
            username: 'user',
            globalName: null,
            roleIds: [],
            effectiveAccess: MANAGE_ACCESS,
            canManageRbac: true,
        },
    } as never)
}

describe('guildStore', () => {
    beforeEach(() => {
        useGuildStore.setState({
            guilds: [],
            selectedGuild: null,
            selectedGuildId: null,
            currentGuildRequestId: 0,
            currentGuildSelectionRequestId: 0,
            isLoading: false,
            guildLoadError: null,
            memberContext: null,
            memberContextLoading: false,
            serverSettings: null,
        } as never)
        vi.clearAllMocks()
    })

    describe('fetchGuilds', () => {
        test('should fetch and set guilds', async () => {
            const guilds = [mockGuild(), mockGuild({ id: '2', name: 'Other' })]
            vi.mocked(api.guilds.list).mockResolvedValue({
                data: { guilds },
            } as never)
            setupSelectedGuildApiMocks(guilds[0].id)

            await useGuildStore.getState().fetchGuilds()

            expect(useGuildStore.getState().guilds).toHaveLength(2)
            expect(useGuildStore.getState().isLoading).toBe(false)
        })

        test('should auto-select first authorized guild', async () => {
            const guilds = [
                mockGuild({ id: '1', botAdded: false }),
                mockGuild({ id: '2', botAdded: true }),
            ]
            vi.mocked(api.guilds.list).mockResolvedValue({
                data: { guilds },
            } as never)
            setupSelectedGuildApiMocks(guilds[1].id)

            await useGuildStore.getState().fetchGuilds()

            expect(useGuildStore.getState().selectedGuildId).toBe('2')
        })

        test('should keep no guild selected when no server has bot added', async () => {
            const guilds = [
                mockGuild({ id: '1', botAdded: false }),
                mockGuild({ id: '2', botAdded: false }),
            ]
            vi.mocked(api.guilds.list).mockResolvedValue({
                data: { guilds },
            } as never)

            await useGuildStore.getState().fetchGuilds()

            expect(useGuildStore.getState().selectedGuildId).toBeNull()
            expect(vi.mocked(api.guilds.getMe)).not.toHaveBeenCalled()
        })

        test('should reset on fetch error', async () => {
            vi.mocked(api.guilds.list).mockRejectedValue(
                new Error('Network error'),
            )

            await useGuildStore.getState().fetchGuilds()

            expect(useGuildStore.getState().guilds).toEqual([])
            expect(useGuildStore.getState().isLoading).toBe(false)
        })

        test('should classify auth failures', async () => {
            vi.mocked(api.guilds.list).mockRejectedValue(
                new ApiError(401, 'Session expired'),
            )

            await useGuildStore.getState().fetchGuilds()

            const state = useGuildStore.getState() as unknown as {
                guildLoadError?: { kind: string; status?: number }
            }
            expect(state.guildLoadError).toEqual({
                kind: 'auth',
                message: 'Session expired',
                status: 401,
            })
        })

        test('should classify network failures', async () => {
            vi.mocked(api.guilds.list).mockRejectedValue(
                new ApiError(0, 'Unable to connect to the server'),
            )

            await useGuildStore.getState().fetchGuilds()

            const state = useGuildStore.getState() as unknown as {
                guildLoadError?: { kind: string; status?: number }
            }
            expect(state.guildLoadError).toEqual({
                kind: 'network',
                message: 'Unable to connect to the server',
                status: 0,
            })
        })

        test('should classify forbidden failures', async () => {
            vi.mocked(api.guilds.list).mockRejectedValue(
                new ApiError(403, 'Missing required scope'),
            )

            await useGuildStore.getState().fetchGuilds()

            const state = useGuildStore.getState() as unknown as {
                guildLoadError?: { kind: string; status?: number }
            }
            expect(state.guildLoadError).toEqual({
                kind: 'forbidden',
                message: 'Missing required scope',
                status: 403,
            })
        })

        test('should classify upstream failures', async () => {
            vi.mocked(api.guilds.list).mockRejectedValue(
                new ApiError(502, 'Discord API unavailable'),
            )

            await useGuildStore.getState().fetchGuilds()

            const state = useGuildStore.getState() as unknown as {
                guildLoadError?: { kind: string; status?: number }
            }
            expect(state.guildLoadError).toEqual({
                kind: 'upstream',
                message: 'Discord API unavailable',
                status: 502,
            })
        })

        test('should classify unknown failures as upstream with fallback message', async () => {
            vi.mocked(api.guilds.list).mockRejectedValue('unexpected')

            await useGuildStore.getState().fetchGuilds()

            const state = useGuildStore.getState() as unknown as {
                guildLoadError?: { kind: string; status?: number; message: string }
            }
            expect(state.guildLoadError).toEqual({
                kind: 'upstream',
                message: 'Unable to load servers',
            })
        })

        test('should preserve selected guild when still present after refresh', async () => {
            const selectedGuild = mockGuild({ id: '2', name: 'Selected guild' })
            useGuildStore.setState({
                selectedGuild,
                selectedGuildId: selectedGuild.id,
            } as never)
            vi.mocked(api.guilds.list).mockResolvedValue({
                data: {
                    guilds: [mockGuild({ id: '1' }), selectedGuild, mockGuild({ id: '3' })],
                },
            } as never)

            await useGuildStore.getState().fetchGuilds()

            expect(useGuildStore.getState().selectedGuildId).toBe(selectedGuild.id)
            expect(useGuildStore.getState().selectedGuild?.name).toBe('Selected guild')
        })

        test('clears guild-scoped state when selected guild is removed and no bot-added guild remains', async () => {
            const selectedGuild = mockGuild({ id: 'selected', name: 'Selected guild' })
            useGuildStore.setState({
                selectedGuild,
                selectedGuildId: selectedGuild.id,
                memberContext: {
                    guildId: selectedGuild.id,
                    nickname: 'Stale nick',
                    username: 'stale-user',
                    globalName: null,
                    roleIds: ['role-a'],
                    effectiveAccess: MANAGE_ACCESS,
                    canManageRbac: true,
                },
                memberContextLoading: true,
                serverSettings: {
                    nickname: 'Stale settings',
                    commandPrefix: '!',
                    managerRoles: [],
                    updatesChannel: '',
                    timezone: 'UTC',
                    disableWarnings: false,
                },
            } as never)

            vi.mocked(api.guilds.list).mockResolvedValue({
                data: {
                    guilds: [
                        mockGuild({ id: '1', botAdded: false }),
                        mockGuild({ id: '2', botAdded: false }),
                    ],
                },
            } as never)

            await useGuildStore.getState().fetchGuilds()

            const state = useGuildStore.getState()
            expect(state.selectedGuildId).toBeNull()
            expect(state.memberContext).toBeNull()
            expect(state.memberContextLoading).toBe(false)
            expect(state.serverSettings).toBeNull()
            expect(vi.mocked(api.guilds.getMe)).not.toHaveBeenCalled()
        })

        test('should ignore stale fetch failures when a newer request succeeds', async () => {
            let rejectFirstRequest: ((error: unknown) => void) | null = null
            let resolveSecondRequest:
                | ((value: { data: { guilds: Guild[] } }) => void)
                | null = null

            vi.mocked(api.guilds.list)
                .mockImplementationOnce(
                    () =>
                        new Promise((_resolve, reject) => {
                            rejectFirstRequest = reject
                        }) as never,
                )
                .mockImplementationOnce(
                    () =>
                        new Promise((resolve) => {
                            resolveSecondRequest = resolve
                        }) as never,
                )

            const firstFetch = useGuildStore.getState().fetchGuilds()
            const secondFetch = useGuildStore.getState().fetchGuilds()

            expect(resolveSecondRequest).not.toBeNull()
            expect(rejectFirstRequest).not.toBeNull()

            resolveSecondRequest!({
                data: { guilds: [mockGuild({ id: 'latest' })] },
            })
            await secondFetch

            rejectFirstRequest!(new ApiError(502, 'Discord API unavailable'))
            await firstFetch

            const state = useGuildStore.getState()
            expect(state.guilds.map((guild) => guild.id)).toEqual(['latest'])
            expect(state.guildLoadError).toBeNull()
        })
    })

    describe('selectGuild', () => {
        test('should set selected guild and id', () => {
            const guild = mockGuild()
            setupSelectedGuildApiMocks(guild.id)

            useGuildStore.getState().selectGuild(guild)

            expect(useGuildStore.getState().selectedGuild).toEqual(guild)
            expect(useGuildStore.getState().selectedGuildId).toBe(guild.id)
        })

        test('should clear when null', () => {
            useGuildStore.getState().selectGuild(null)

            expect(useGuildStore.getState().selectedGuild).toBeNull()
            expect(useGuildStore.getState().selectedGuildId).toBeNull()
        })

        test('should clear member context and settings when dependent calls fail', async () => {
            const guild = mockGuild({ id: 'error-guild' })
            vi.mocked(api.guilds.getMe).mockRejectedValue(new Error('me failed'))
            vi.mocked(api.guilds.getSettings).mockRejectedValue(
                new Error('settings failed'),
            )

            useGuildStore.getState().selectGuild(guild)

            await vi.waitFor(() => {
                const state = useGuildStore.getState()
                expect(state.memberContextLoading).toBe(false)
                expect(state.memberContext).toBeNull()
                expect(state.serverSettings).toBeNull()
            })
        })

        test('should ignore stale async responses from previous selected guild', async () => {
            const guildA = mockGuild({ id: 'guild-a', name: 'Guild A' })
            const guildB = mockGuild({ id: 'guild-b', name: 'Guild B' })

            const deferred = <T>() => {
                let resolve: (value: T) => void = () => {}
                const promise = new Promise<T>((res) => {
                    resolve = res
                })
                return { promise, resolve }
            }

            const meA = deferred<MeResponse>()
            const settingsA = deferred<SettingsResponse>()

            vi.mocked(api.guilds.getMe).mockImplementation((guildId: string) => {
                if (guildId === guildA.id) {
                    return meA.promise as never
                }
                return Promise.resolve({
                    data: {
                        guildId,
                        nickname: 'B Nick',
                        username: 'user-b',
                        globalName: null,
                        roleIds: ['role-b'],
                        effectiveAccess: MANAGE_ACCESS,
                        canManageRbac: true,
                    },
                } as never)
            })

            vi.mocked(api.guilds.getSettings).mockImplementation((guildId: string) => {
                if (guildId === guildA.id) {
                    return settingsA.promise as never
                }
                return Promise.resolve({
                    data: {
                        settings: {
                            nickname: 'Settings B',
                            commandPrefix: '!',
                            managerRoles: [],
                            updatesChannel: 'updates',
                            timezone: 'UTC',
                            disableWarnings: false,
                        },
                    },
                } as never)
            })

            useGuildStore.getState().selectGuild(guildA)
            useGuildStore.getState().selectGuild(guildB)

            await vi.waitFor(() => {
                const state = useGuildStore.getState()
                expect(state.selectedGuildId).toBe(guildB.id)
                expect(state.memberContext?.guildId).toBe(guildB.id)
                expect(state.serverSettings?.nickname).toBe('Settings B')
            })

            meA.resolve({
                data: {
                    guildId: guildA.id,
                    nickname: 'A Nick',
                    username: 'user-a',
                    globalName: null,
                    roleIds: ['role-a'],
                    effectiveAccess: MANAGE_ACCESS,
                    canManageRbac: true,
                },
            })
            settingsA.resolve({
                data: {
                    settings: {
                        nickname: 'Settings A',
                        commandPrefix: '?',
                        managerRoles: ['mod'],
                        updatesChannel: 'old-updates',
                        timezone: 'GMT',
                        disableWarnings: true,
                    },
                },
            })

            await Promise.resolve()

            const state = useGuildStore.getState()
            expect(state.selectedGuildId).toBe(guildB.id)
            expect(state.memberContext?.guildId).toBe(guildB.id)
            expect(state.serverSettings?.nickname).toBe('Settings B')
        })
    })

    describe('updateServerSettings', () => {
        test('should merge partial settings', () => {
            useGuildStore.setState({
                serverSettings: {
                    nickname: 'Bot',
                    commandPrefix: '!',
                    managerRoles: [],
                    updatesChannel: '',
                    timezone: 'UTC',
                    disableWarnings: false,
                },
            })

            useGuildStore.getState().updateServerSettings({ nickname: 'New' })

            expect(useGuildStore.getState().serverSettings?.nickname).toBe(
                'New',
            )
            expect(useGuildStore.getState().serverSettings?.commandPrefix).toBe(
                '!',
            )
        })

        test('should no-op when settings is null', () => {
            useGuildStore.setState({ serverSettings: null })
            useGuildStore.getState().updateServerSettings({ nickname: 'New' })
            expect(useGuildStore.getState().serverSettings).toBeNull()
        })
    })

    describe('setSelectedGuild', () => {
        test('should find guild by id and select it', () => {
            const guild = mockGuild({ id: '42' })
            useGuildStore.setState({ guilds: [guild] })
            setupSelectedGuildApiMocks(guild.id)

            useGuildStore.getState().setSelectedGuild('42')

            expect(useGuildStore.getState().selectedGuild).toEqual(guild)
        })

        test('should select null for unknown id', () => {
            useGuildStore.setState({ guilds: [] })

            useGuildStore.getState().setSelectedGuild('unknown')

            expect(useGuildStore.getState().selectedGuild).toBeNull()
        })
    })

    describe('getSelectedGuild', () => {
        test('should return currently selected guild', () => {
            const guild = mockGuild({ id: 'selected' })
            useGuildStore.setState({ selectedGuild: guild, selectedGuildId: guild.id })

            const selectedGuild = useGuildStore.getState().getSelectedGuild()

            expect(selectedGuild).toEqual(guild)
        })
    })

})
