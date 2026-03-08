import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CustomCommandsPage from './CustomCommands'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'
import type { Command } from '@/types'

vi.mock('@/services/api')
vi.mock('@/stores/guildStore')
vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}))

const mockGuild = {
    id: '123',
    name: 'Test Guild',
    icon: null,
    owner: true,
    permissions: '8',
    features: [],
    approximate_member_count: 100,
    approximate_presence_count: 50,
}

const mockCommands: Command[] = [
    {
        id: 'cmd1',
        name: 'play',
        description: 'Play a song',
        category: 'Music',
        enabled: true,
    },
    {
        id: 'cmd2',
        name: 'ban',
        description: 'Ban a user',
        category: 'Moderator',
        enabled: true,
    },
    {
        id: 'cmd3',
        name: 'coinflip',
        description: 'Flip a coin',
        category: 'Fun',
        enabled: false,
    },
]

function mockGuildStore(guild: typeof mockGuild | null) {
    vi.mocked(useGuildStore).mockReturnValue({
        guilds: guild ? [guild] : [],
        selectedGuild: guild as any,
        selectGuild: vi.fn(),
        isLoading: false,
        error: null,
        fetchGuilds: vi.fn(),
    } as any)
}

const renderPage = () => {
    return render(
        <MemoryRouter>
            <CustomCommandsPage />
        </MemoryRouter>,
    )
}

describe('CustomCommandsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows no server selected when no guild', () => {
        mockGuildStore(null)
        renderPage()
        expect(screen.getByText('No Server Selected')).toBeInTheDocument()
        expect(
            screen.getByText('Select a server to manage commands'),
        ).toBeInTheDocument()
    })

    test('shows loading skeletons while fetching', () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockImplementation(
            () => new Promise(() => {}),
        )
        renderPage()
        const skeletons = document.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    test('renders command cards on success', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('/play')).toBeInTheDocument()
            expect(screen.getByText('/ban')).toBeInTheDocument()
            expect(screen.getByText('/coinflip')).toBeInTheDocument()
        })
    })

    test('renders command descriptions', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Play a song')).toBeInTheDocument()
            expect(screen.getByText('Ban a user')).toBeInTheDocument()
            expect(screen.getByText('Flip a coin')).toBeInTheDocument()
        })
    })

    test('renders category badges', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Music')).toBeInTheDocument()
            expect(screen.getByText('Moderator')).toBeInTheDocument()
            expect(screen.getByText('Fun')).toBeInTheDocument()
        })
    })

    test('renders toggle switches', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)

        renderPage()

        await waitFor(() => {
            const switches = screen.getAllByRole('switch')
            expect(switches.length).toBe(3)
            expect(switches[0]).toBeChecked()
            expect(switches[1]).toBeChecked()
            expect(switches[2]).not.toBeChecked()
        })
    })

    test('shows empty state when no commands', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: [] },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('No commands found')).toBeInTheDocument()
            expect(
                screen.getByText('Commands will appear here'),
            ).toBeInTheDocument()
        })
    })

    test('search filters commands by name', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('/play')).toBeInTheDocument()
        })

        const searchInput = screen.getByPlaceholderText('Search commands...')
        await user.type(searchInput, 'play')

        await waitFor(() => {
            expect(screen.getByText('/play')).toBeInTheDocument()
            expect(screen.queryByText('/ban')).not.toBeInTheDocument()
            expect(screen.queryByText('/coinflip')).not.toBeInTheDocument()
        })
    })

    test('search filters commands by description', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('/play')).toBeInTheDocument()
        })

        const searchInput = screen.getByPlaceholderText('Search commands...')
        await user.type(searchInput, 'coin')

        await waitFor(() => {
            expect(screen.getByText('/coinflip')).toBeInTheDocument()
            expect(screen.queryByText('/play')).not.toBeInTheDocument()
            expect(screen.queryByText('/ban')).not.toBeInTheDocument()
        })
    })

    test('clears search on X button click', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('/play')).toBeInTheDocument()
        })

        const searchInput = screen.getByPlaceholderText('Search commands...')
        await user.type(searchInput, 'play')

        await waitFor(() => {
            expect(screen.queryByText('/ban')).not.toBeInTheDocument()
        })

        const clearButton = screen.getByRole('button', { name: '' })
        await user.click(clearButton)

        await waitFor(() => {
            expect(screen.getByText('/play')).toBeInTheDocument()
            expect(screen.getByText('/ban')).toBeInTheDocument()
            expect(screen.getByText('/coinflip')).toBeInTheDocument()
        })
    })

    test('category filter chips work', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText(/All \(3\)/)).toBeInTheDocument()
        })

        const musicChip = screen.getByRole('button', { name: /Music \(1\)/ })
        await user.click(musicChip)

        await waitFor(() => {
            expect(screen.getByText('/play')).toBeInTheDocument()
            expect(screen.queryByText('/ban')).not.toBeInTheDocument()
            expect(screen.queryByText('/coinflip')).not.toBeInTheDocument()
        })
    })

    test('clicking category twice resets filter', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText(/All \(3\)/)).toBeInTheDocument()
        })

        const funChip = screen.getByRole('button', { name: /Fun \(1\)/ })
        await user.click(funChip)

        await waitFor(() => {
            expect(screen.queryByText('/play')).not.toBeInTheDocument()
        })

        await user.click(funChip)

        await waitFor(() => {
            expect(screen.getByText('/play')).toBeInTheDocument()
            expect(screen.getByText('/ban')).toBeInTheDocument()
        })
    })

    test('all chip resets category filter', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText(/All \(3\)/)).toBeInTheDocument()
        })

        const moderatorChip = screen.getByRole('button', {
            name: /Moderator \(1\)/,
        })
        await user.click(moderatorChip)

        await waitFor(() => {
            expect(screen.queryByText('/play')).not.toBeInTheDocument()
        })

        const allChip = screen.getByRole('button', { name: /All \(3\)/ })
        await user.click(allChip)

        await waitFor(() => {
            expect(screen.getByText('/play')).toBeInTheDocument()
            expect(screen.getByText('/ban')).toBeInTheDocument()
            expect(screen.getByText('/coinflip')).toBeInTheDocument()
        })
    })

    test('toggle command calls api.commands.toggle', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)
        vi.mocked(api.commands.toggle).mockResolvedValue({} as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('/coinflip')).toBeInTheDocument()
        })

        const switches = screen.getAllByRole('switch')
        const coinflipSwitch = switches[2]

        await user.click(coinflipSwitch)

        await waitFor(() => {
            expect(api.commands.toggle).toHaveBeenCalledWith(
                '123',
                'cmd3',
                true,
            )
        })
    })

    test('toggle success shows toast', async () => {
        const user = userEvent.setup()
        const { toast } = await import('sonner')
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)
        vi.mocked(api.commands.toggle).mockResolvedValue({} as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('/coinflip')).toBeInTheDocument()
        })

        const switches = screen.getAllByRole('switch')
        await user.click(switches[2])

        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith('coinflip enabled')
        })
    })

    test('toggle failure shows error toast', async () => {
        const user = userEvent.setup()
        const { toast } = await import('sonner')
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)
        vi.mocked(api.commands.toggle).mockRejectedValue(
            new Error('Network error'),
        )

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('/play')).toBeInTheDocument()
        })

        const switches = screen.getAllByRole('switch')
        await user.click(switches[0])

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Failed to toggle command')
        })
    })

    test('toggle updates local state on success', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)
        vi.mocked(api.commands.toggle).mockResolvedValue({} as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('/coinflip')).toBeInTheDocument()
        })

        const switches = screen.getAllByRole('switch')
        const coinflipSwitch = switches[2]

        expect(coinflipSwitch).not.toBeChecked()

        await user.click(coinflipSwitch)

        await waitFor(() => {
            expect(coinflipSwitch).toBeChecked()
        })
    })

    test('disabled command has opacity styling', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('/coinflip')).toBeInTheDocument()
        })

        const coinflipCard = screen
            .getByText('/coinflip')
            .closest('[class*="p-4"]')
        expect(coinflipCard).toHaveClass('opacity-60')
    })

    test('shows empty state with filters applied', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('/play')).toBeInTheDocument()
        })

        const searchInput = screen.getByPlaceholderText('Search commands...')
        await user.type(searchInput, 'nonexistent')

        await waitFor(() => {
            expect(screen.getByText('No commands found')).toBeInTheDocument()
            expect(
                screen.getByText('Try adjusting your filters'),
            ).toBeInTheDocument()
        })
    })

    test('handles API error gracefully', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockRejectedValue(
            new Error('Network error'),
        )

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('No commands found')).toBeInTheDocument()
        })
    })

    test('renders header with guild name', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Custom Commands')).toBeInTheDocument()
            expect(
                screen.getByText(
                    /Manage and configure commands for Test Guild/,
                ),
            ).toBeInTheDocument()
        })
    })
})
