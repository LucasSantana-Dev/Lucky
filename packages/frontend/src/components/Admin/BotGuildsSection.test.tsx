import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import BotGuildsSection from './BotGuildsSection'
import { api } from '@/services/api'

vi.mock('@/services/api', () => ({
    api: {
        admin: {
            getGuilds: vi.fn(),
        },
    },
}))

const makeGuild = (overrides = {}) => ({
    id: '111',
    name: 'Test Guild',
    iconUrl: null,
    memberCount: null,
    textChannelCount: null,
    voiceChannelCount: null,
    roleCount: null,
    ...overrides,
})

describe('BotGuildsSection', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows loading skeletons while fetching', () => {
        vi.mocked(api.admin.getGuilds).mockImplementation(() => new Promise(() => {}))
        const { container } = render(<BotGuildsSection />)
        expect(container.querySelectorAll('.animate-pulse').length).toBe(5)
    })

    test('renders guild list with count badge after load', async () => {
        vi.mocked(api.admin.getGuilds).mockResolvedValue({
            data: {
                guilds: [makeGuild({ id: '100', name: 'Alpha' }), makeGuild({ id: '200', name: 'Beta' })],
            },
        })
        render(<BotGuildsSection />)
        await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
        expect(screen.getByText('Beta')).toBeInTheDocument()
        expect(screen.getByText('2')).toBeInTheDocument()
    })

    test('sorts guilds alphabetically by name', async () => {
        vi.mocked(api.admin.getGuilds).mockResolvedValue({
            data: {
                guilds: [
                    makeGuild({ id: '1', name: 'Zebra' }),
                    makeGuild({ id: '2', name: 'Apple' }),
                ],
            },
        })
        render(<BotGuildsSection />)
        await waitFor(() => expect(screen.getByText('Apple')).toBeInTheDocument())
        const names = screen.getAllByText(/Apple|Zebra/).map((el) => el.textContent)
        expect(names[0]).toBe('Apple')
        expect(names[1]).toBe('Zebra')
    })

    test('displays numeric guild stats when present', async () => {
        vi.mocked(api.admin.getGuilds).mockResolvedValue({
            data: {
                guilds: [
                    makeGuild({
                        memberCount: 250,
                        textChannelCount: 15,
                        voiceChannelCount: 3,
                        roleCount: 42,
                    }),
                ],
            },
        })
        render(<BotGuildsSection />)
        await waitFor(() => expect(screen.getByText('Test Guild')).toBeInTheDocument())
        expect(screen.getByText('250')).toBeInTheDocument()
        expect(screen.getByText('15')).toBeInTheDocument()
        expect(screen.getByText('3')).toBeInTheDocument()
        expect(screen.getByText('42')).toBeInTheDocument()
    })

    test('shows error message on fetch failure', async () => {
        vi.mocked(api.admin.getGuilds).mockRejectedValue(new Error('Network error'))
        render(<BotGuildsSection />)
        await waitFor(() =>
            expect(screen.getByText('Failed to load server list.')).toBeInTheDocument(),
        )
    })

    test('shows empty state when no guilds returned', async () => {
        vi.mocked(api.admin.getGuilds).mockResolvedValue({ data: { guilds: [] } })
        render(<BotGuildsSection />)
        await waitFor(() =>
            expect(
                screen.getByText('No servers found. The bot may not be connected.'),
            ).toBeInTheDocument(),
        )
    })

    test('renders guild icon image when iconUrl provided', async () => {
        vi.mocked(api.admin.getGuilds).mockResolvedValue({
            data: {
                guilds: [makeGuild({ name: 'Icon Guild', iconUrl: 'https://cdn.discord.com/icon.png' })],
            },
        })
        render(<BotGuildsSection />)
        await waitFor(() => {
            const img = screen.getByAltText('Icon Guild') as HTMLImageElement
            expect(img.src).toBe('https://cdn.discord.com/icon.png')
        })
    })

    test('renders fallback Server icon when iconUrl is null', async () => {
        vi.mocked(api.admin.getGuilds).mockResolvedValue({
            data: { guilds: [makeGuild({ name: 'No Icon Guild', iconUrl: null })] },
        })
        render(<BotGuildsSection />)
        await waitFor(() => expect(screen.getByText('No Icon Guild')).toBeInTheDocument())
        expect(screen.queryByAltText('No Icon Guild')).not.toBeInTheDocument()
    })
})
