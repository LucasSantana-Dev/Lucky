import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CustomCommandsPage from './CustomCommands'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'
import type { Command } from '@/types'
import type { EffectiveAccessMap } from '@/types/rbac'

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

const manageAccess: EffectiveAccessMap = {
    overview: 'manage',
    settings: 'manage',
    moderation: 'manage',
    automation: 'manage',
    music: 'manage',
    integrations: 'manage',
}

const viewOnlyAccess: EffectiveAccessMap = {
    ...manageAccess,
    automation: 'view',
}

const mockCommands: Command[] = [
    {
        id: 'cmd1',
        name: 'play',
        description: 'Play a song',
        response: 'Now playing!',
        enabled: true,
        useCount: 3,
        commandKind: 'basic',
    },
    {
        id: 'cmd2',
        name: 'coinflip',
        description: 'Flip a coin',
        response: 'Heads!',
        enabled: false,
        useCount: 0,
        commandKind: 'basic',
    },
]

function mockGuildStore(
    guild: typeof mockGuild | null,
    effectiveAccess: EffectiveAccessMap = manageAccess,
) {
    vi.mocked(useGuildStore).mockReturnValue({
        guilds: guild ? [guild] : [],
        selectedGuild: guild
            ? ({ ...guild, effectiveAccess } as any)
            : (null as any),
        memberContext: null,
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

    test('renders command cards with name and description, without category', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('/play')).toBeInTheDocument()
            expect(screen.getByText('Play a song')).toBeInTheDocument()
            expect(screen.getByText('/coinflip')).toBeInTheDocument()
        })
    })

    test('search filters commands by name', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)

        renderPage()
        await waitFor(() =>
            expect(screen.getByText('/play')).toBeInTheDocument(),
        )

        await user.type(
            screen.getByPlaceholderText('Search commands...'),
            'play',
        )

        await waitFor(() => {
            expect(screen.getByText('/play')).toBeInTheDocument()
            expect(screen.queryByText('/coinflip')).not.toBeInTheDocument()
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
        })
    })

    test('toggle calls api.commands.toggle keyed by name, not id', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)
        vi.mocked(api.commands.toggle).mockResolvedValue({} as any)

        renderPage()
        await waitFor(() =>
            expect(screen.getByText('/coinflip')).toBeInTheDocument(),
        )

        const switches = screen.getAllByRole('switch')
        await user.click(switches[1])

        await waitFor(() => {
            expect(api.commands.toggle).toHaveBeenCalledWith(
                '123',
                'coinflip',
                true,
            )
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
        await waitFor(() =>
            expect(screen.getByText('/play')).toBeInTheDocument(),
        )

        await user.click(screen.getAllByRole('switch')[0])

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalled()
        })
    })

    test('no button contains a nested switch or another button (#2427)', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)

        renderPage()
        await waitFor(() =>
            expect(screen.getByText('/play')).toBeInTheDocument(),
        )

        const buttons = screen.getAllByRole('button')
        for (const button of buttons) {
            expect(within(button).queryByRole('switch')).not.toBeInTheDocument()
            const nestedButtons = button.querySelectorAll('button')
            expect(nestedButtons.length).toBe(0)
        }
    })

    describe('manage-only controls (rbac gating)', () => {
        test('hides new command button without manage access', async () => {
            mockGuildStore(mockGuild, viewOnlyAccess)
            vi.mocked(api.commands.list).mockResolvedValue({
                data: { commands: mockCommands },
            } as any)

            renderPage()
            await waitFor(() =>
                expect(screen.getByText('/play')).toBeInTheDocument(),
            )

            expect(
                screen.queryByRole('button', { name: /new command/i }),
            ).not.toBeInTheDocument()
        })

        test('hides edit and delete controls without manage access', async () => {
            mockGuildStore(mockGuild, viewOnlyAccess)
            vi.mocked(api.commands.list).mockResolvedValue({
                data: { commands: mockCommands },
            } as any)

            renderPage()
            await waitFor(() =>
                expect(screen.getByText('/play')).toBeInTheDocument(),
            )

            expect(
                screen.queryByRole('button', { name: /edit play/i }),
            ).not.toBeInTheDocument()
            expect(
                screen.queryByRole('button', { name: /delete play/i }),
            ).not.toBeInTheDocument()
        })

        test('shows new command button with manage access', async () => {
            mockGuildStore(mockGuild, manageAccess)
            vi.mocked(api.commands.list).mockResolvedValue({
                data: { commands: mockCommands },
            } as any)

            renderPage()
            await waitFor(() =>
                expect(screen.getByText('/play')).toBeInTheDocument(),
            )

            expect(
                screen.getByRole('button', { name: /new command/i }),
            ).toBeInTheDocument()
        })
    })

    describe('create command', () => {
        test('submitting the form calls api.commands.create and adds the command', async () => {
            const user = userEvent.setup()
            mockGuildStore(mockGuild, manageAccess)
            vi.mocked(api.commands.list).mockResolvedValue({
                data: { commands: [] },
            } as any)
            vi.mocked(api.commands.create).mockResolvedValue({
                data: {
                    id: 'cmd3',
                    name: 'welcome',
                    description: null,
                    response: 'Welcome!',
                    enabled: true,
                    useCount: 0,
                    commandKind: 'basic',
                },
            } as any)

            renderPage()
            await waitFor(() =>
                expect(
                    screen.getByText('No commands found'),
                ).toBeInTheDocument(),
            )

            await user.click(
                screen.getByRole('button', { name: /new command/i }),
            )
            await user.type(screen.getByLabelText(/name/i), 'welcome')
            await user.type(screen.getByLabelText(/response/i), 'Welcome!')
            await user.click(screen.getByRole('button', { name: /^create$/i }))

            await waitFor(() => {
                expect(api.commands.create).toHaveBeenCalledWith('123', {
                    name: 'welcome',
                    response: 'Welcome!',
                })
            })
            await waitFor(() =>
                expect(screen.getByText('/welcome')).toBeInTheDocument(),
            )
        })

        test('shows a validation error and does not call the API for an invalid name', async () => {
            const user = userEvent.setup()
            mockGuildStore(mockGuild, manageAccess)
            vi.mocked(api.commands.list).mockResolvedValue({
                data: { commands: [] },
            } as any)

            renderPage()
            await waitFor(() =>
                expect(
                    screen.getByText('No commands found'),
                ).toBeInTheDocument(),
            )

            await user.click(
                screen.getByRole('button', { name: /new command/i }),
            )
            await user.type(screen.getByLabelText(/name/i), 'bad name!')
            await user.type(screen.getByLabelText(/response/i), 'hi')
            await user.click(screen.getByRole('button', { name: /^create$/i }))

            await waitFor(() => {
                expect(api.commands.create).not.toHaveBeenCalled()
            })
            expect(
                screen.getByText(
                    'Name must be alphanumeric with dashes/underscores',
                ),
            ).toBeInTheDocument()
        })
    })

    describe('edit command', () => {
        test('submitting the edit form calls api.commands.update keyed by name', async () => {
            const user = userEvent.setup()
            mockGuildStore(mockGuild, manageAccess)
            vi.mocked(api.commands.list).mockResolvedValue({
                data: { commands: mockCommands },
            } as any)
            vi.mocked(api.commands.update).mockResolvedValue({
                data: { ...mockCommands[0], response: 'New response' },
            } as any)

            renderPage()
            await waitFor(() =>
                expect(screen.getByText('/play')).toBeInTheDocument(),
            )

            await user.click(screen.getByRole('button', { name: /edit play/i }))

            const responseField = screen.getByLabelText(/response/i)
            await user.clear(responseField)
            await user.type(responseField, 'New response')
            await user.click(
                screen.getByRole('button', { name: /save changes/i }),
            )

            await waitFor(() => {
                expect(api.commands.update).toHaveBeenCalledWith(
                    '123',
                    'play',
                    { response: 'New response', description: 'Play a song' },
                )
            })
        })
    })

    describe('delete command', () => {
        test('clicking delete opens a confirm dialog and cancel does not call the API', async () => {
            const user = userEvent.setup()
            mockGuildStore(mockGuild, manageAccess)
            vi.mocked(api.commands.list).mockResolvedValue({
                data: { commands: mockCommands },
            } as any)

            renderPage()
            await waitFor(() =>
                expect(screen.getByText('/play')).toBeInTheDocument(),
            )

            await user.click(
                screen.getByRole('button', { name: /delete play/i }),
            )
            expect(screen.getByText(/delete command/i)).toBeInTheDocument()

            await user.click(screen.getByRole('button', { name: /cancel/i }))

            expect(api.commands.delete).not.toHaveBeenCalled()
        })

        test('confirming delete calls api.commands.delete keyed by name and removes the row', async () => {
            const user = userEvent.setup()
            mockGuildStore(mockGuild, manageAccess)
            vi.mocked(api.commands.list).mockResolvedValue({
                data: { commands: mockCommands },
            } as any)
            vi.mocked(api.commands.delete).mockResolvedValue({
                data: { success: true },
            } as any)

            renderPage()
            await waitFor(() =>
                expect(screen.getByText('/play')).toBeInTheDocument(),
            )

            await user.click(
                screen.getByRole('button', { name: /delete play/i }),
            )
            await user.click(screen.getByRole('button', { name: /^delete$/i }))

            await waitFor(() => {
                expect(api.commands.delete).toHaveBeenCalledWith('123', 'play')
            })
            await waitFor(() =>
                expect(screen.queryByText('/play')).not.toBeInTheDocument(),
            )
        })
    })
})
