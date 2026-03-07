import { describe, test, expect, vi, beforeEach } from 'vitest'
import { useGuildStore } from './guildStore'
import type { Guild } from '@/types'

vi.mock('@/services/api', () => ({
    api: {
        guilds: {
            list: vi.fn(),
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

describe('guildStore', () => {
    beforeEach(() => {
        useGuildStore.setState({
            guilds: [],
            selectedGuild: null,
            selectedGuildId: null,
            isLoading: false,
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
            vi.mocked(api.guilds.getSettings).mockResolvedValue({
                data: { settings: null },
            } as never)
            vi.mocked(api.guilds.getListing).mockResolvedValue({
                data: { listing: null },
            } as never)

            await useGuildStore.getState().fetchGuilds()

            expect(useGuildStore.getState().guilds).toHaveLength(2)
            expect(useGuildStore.getState().isLoading).toBe(false)
        })

        test('should auto-select first guild with bot', async () => {
            const guilds = [
                mockGuild({ id: '1', botAdded: false }),
                mockGuild({ id: '2', botAdded: true }),
            ]
            vi.mocked(api.guilds.list).mockResolvedValue({
                data: { guilds },
            } as never)
            vi.mocked(api.guilds.getSettings).mockResolvedValue({
                data: { settings: null },
            } as never)
            vi.mocked(api.guilds.getListing).mockResolvedValue({
                data: { listing: null },
            } as never)

            await useGuildStore.getState().fetchGuilds()

            expect(useGuildStore.getState().selectedGuildId).toBe('2')
        })

        test('should reset on fetch error', async () => {
            vi.mocked(api.guilds.list).mockRejectedValue(
                new Error('Network error'),
            )

            await useGuildStore.getState().fetchGuilds()

            expect(useGuildStore.getState().guilds).toEqual([])
            expect(useGuildStore.getState().isLoading).toBe(false)
        })
    })

    describe('selectGuild', () => {
        test('should set selected guild and id', () => {
            const guild = mockGuild()
            vi.mocked(api.guilds.getSettings).mockResolvedValue({
                data: { settings: null },
            } as never)
            vi.mocked(api.guilds.getListing).mockResolvedValue({
                data: { listing: null },
            } as never)

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
            vi.mocked(api.guilds.getSettings).mockResolvedValue({
                data: { settings: null },
            } as never)
            vi.mocked(api.guilds.getListing).mockResolvedValue({
                data: { listing: null },
            } as never)

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
