import { describe, test, expect, vi, beforeEach } from 'vitest'
import { useGuildStore } from './guildStore'
import type { Guild } from '@/types'

vi.mock('@/services/api', () => ({
    api: {
        guilds: {
            list: vi.fn(),
            get: vi.fn(),
            getMe: vi.fn(),
            getSettings: vi.fn(),
            getListing: vi.fn(),
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

function setupSelectedGuildApiMocks(guildId: string, guild?: Guild) {
    vi.mocked(api.guilds.get).mockResolvedValue({
        data: { guild: guild ?? mockGuild({ id: guildId }) },
    } as never)
    vi.mocked(api.guilds.getSettings).mockResolvedValue({
        data: { settings: null },
    } as never)
    vi.mocked(api.guilds.getListing).mockResolvedValue({
        data: { listing: null },
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
            isLoading: false,
            hasFetchedGuilds: false,
            memberContext: null,
            memberContextLoading: false,
            serverSettings: null,
            serverListing: null,
        })
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
            expect(useGuildStore.getState().hasFetchedGuilds).toBe(true)
        })

        test('should auto-select first authorized guild', async () => {
            const guilds = [
                mockGuild({ id: '1', botAdded: false }),
                mockGuild({ id: '2', botAdded: true }),
            ]
            vi.mocked(api.guilds.list).mockResolvedValue({
                data: { guilds },
            } as never)
            setupSelectedGuildApiMocks(guilds[0].id)

            await useGuildStore.getState().fetchGuilds()

            expect(useGuildStore.getState().selectedGuildId).toBe('1')
        })

        test('should reset on fetch error', async () => {
            vi.mocked(api.guilds.list).mockRejectedValue(
                new Error('Network error'),
            )

            await useGuildStore.getState().fetchGuilds()

            expect(useGuildStore.getState().guilds).toEqual([])
            expect(useGuildStore.getState().isLoading).toBe(false)
            expect(useGuildStore.getState().hasFetchedGuilds).toBe(true)
        })

        test('should re-sync selected guild by selectedGuildId after refresh', async () => {
            const staleGuild = mockGuild({ id: '1', name: 'Stale Name' })
            const refreshedGuild = mockGuild({ id: '1', name: 'Fresh Name' })
            useGuildStore.setState({
                selectedGuild: staleGuild,
                selectedGuildId: staleGuild.id,
            })

            vi.mocked(api.guilds.list).mockResolvedValue({
                data: { guilds: [refreshedGuild] },
            } as never)
            setupSelectedGuildApiMocks(refreshedGuild.id, refreshedGuild)

            await useGuildStore.getState().fetchGuilds()

            expect(useGuildStore.getState().selectedGuild?.name).toBe(
                'Fresh Name',
            )
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
})
