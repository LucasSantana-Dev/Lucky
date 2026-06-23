import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ServerLogsPage from './ServerLogs'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'

vi.mock('@/services/api')
vi.mock('@/stores/guildStore')
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-i18next', () => ({
    useTranslation: (_namespace?: string) => {
        const keyMap: { [key: string]: string } = {
            title: 'Server Logs',
            subtitle: 'Activity and moderation logs for {{name}}',
            export: 'Export',
            searchAndFilter: 'Search & Filter',
            searchPlaceholder: 'Search logs…',
            allLevels: 'All levels',
            info: 'Info',
            warnings: 'Warnings',
            errors: 'Errors',
            moderation: 'Moderation',
            autoMod: 'Auto-Mod',
            system: 'System',
            noServerSelected: 'No Server Selected',
            selectServerDescription: 'Select a server to view logs',
            noLogsFound: 'No logs found',
            adjustFilters: 'Try adjusting your filters',
            logsWillAppear: 'Logs will appear here as events occur',
            exportSuccess: 'Logs exported!',
            loadError: 'Failed to load logs. Please try again.',
            userLabel: 'User:',
            channelLabel: 'Channel:',
        }

        return {
            t: (key: string, options?: { [key: string]: any }) => {
                let result = keyMap[key] || key

                // Handle interpolation for {{name}}
                if (options && options.name) {
                    result = result.replace('{{name}}', options.name)
                }

                return result
            },
        }
    },
}))

const mockGuild = { id: '123', name: 'Test Guild' }

const mockLogs = [
    {
        id: 'l1',
        guildId: '123',
        level: 'info' as const,
        type: 'member_join',
        message: 'User joined the server',
        userName: 'TestUser',
        channelName: 'general',
        createdAt: new Date().toISOString(),
    },
    {
        id: 'l2',
        guildId: '123',
        level: 'warn' as const,
        type: 'spam_detected',
        message: 'Spam detected in channel',
        userName: 'BadUser',
        channelName: 'chat',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
        id: 'l3',
        guildId: '123',
        level: 'error' as const,
        type: 'command_error',
        message: 'Command execution failed',
        userName: null,
        channelName: null,
        createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
]

function mockGuildStoreFn(guild: typeof mockGuild | null) {
    vi.mocked(useGuildStore).mockReturnValue({
        guilds: guild ? [guild] : [],
        selectedGuild: guild as any,
        selectGuild: vi.fn(),
        isLoading: false,
        error: null,
        fetchGuilds: vi.fn(),
    } as any)
}

const renderPage = () =>
    render(
        <MemoryRouter>
            <ServerLogsPage />
        </MemoryRouter>,
    )

describe('ServerLogsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows no server selected when no guild', () => {
        mockGuildStoreFn(null)
        renderPage()
        expect(screen.getByText('No Server Selected')).toBeInTheDocument()
        expect(
            screen.getByText('Select a server to view logs'),
        ).toBeInTheDocument()
    })

    test('shows loading skeletons while fetching', () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.serverLogs.getRecent).mockImplementation(
            () => new Promise(() => {}),
        )
        renderPage()
        const skeletons = document.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    test('renders logs on success', async () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.serverLogs.getRecent).mockResolvedValue({
            data: { logs: mockLogs },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(
                screen.getByText('User joined the server'),
            ).toBeInTheDocument()
        })

        expect(screen.getByText('Spam detected in channel')).toBeInTheDocument()
        expect(screen.getByText('Command execution failed')).toBeInTheDocument()
    })

    test('renders header with guild name', async () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.serverLogs.getRecent).mockResolvedValue({
            data: { logs: mockLogs },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Server Logs')).toBeInTheDocument()
        })

        expect(
            screen.getByText(/Activity and moderation logs for Test Guild/),
        ).toBeInTheDocument()
    })

    test('shows user and channel info in log entries', async () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.serverLogs.getRecent).mockResolvedValue({
            data: { logs: mockLogs },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('TestUser')).toBeInTheDocument()
        })

        expect(screen.getByText('#general')).toBeInTheDocument()
    })

    test('shows empty state when no logs', async () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.serverLogs.getRecent).mockResolvedValue({
            data: { logs: [] },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('No logs found')).toBeInTheDocument()
        })

        expect(
            screen.getByText('Logs will appear here as events occur'),
        ).toBeInTheDocument()
    })

    test('shows empty state on API error', async () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.serverLogs.getRecent).mockRejectedValue(
            new Error('Network error'),
        )

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('No logs found')).toBeInTheDocument()
        })
    })

    test('shows export button', async () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.serverLogs.getRecent).mockResolvedValue({
            data: { logs: mockLogs },
        } as any)

        renderPage()

        expect(screen.getByText('Export')).toBeInTheDocument()
    })

    test('renders search input', () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.serverLogs.getRecent).mockImplementation(
            () => new Promise(() => {}),
        )
        renderPage()
        expect(screen.getByPlaceholderText('Search logs…')).toBeInTheDocument()
    })

    test('renders level summary chips', async () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.serverLogs.getRecent).mockResolvedValue({
            data: { logs: mockLogs },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getAllByText('info').length).toBeGreaterThanOrEqual(1)
        })

        expect(screen.getAllByText('warn').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('error').length).toBeGreaterThanOrEqual(1)
    })

    test('updates search query when typing', async () => {
        const user = userEvent.setup()
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.serverLogs.getRecent).mockResolvedValue({
            data: { logs: mockLogs, total: 3 },
        } as any)

        renderPage()
        await waitFor(() =>
            expect(
                screen.getByText('User joined the server'),
            ).toBeInTheDocument(),
        )

        const searchInput = screen.getByPlaceholderText('Search logs…')
        await user.type(searchInput, 'hello')

        expect(searchInput).toHaveValue('hello')
    })

    test('clears search when X button is clicked', async () => {
        const user = userEvent.setup()
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.serverLogs.getRecent).mockResolvedValue({
            data: { logs: mockLogs, total: 3 },
        } as any)

        renderPage()
        await waitFor(() =>
            expect(
                screen.getByText('User joined the server'),
            ).toBeInTheDocument(),
        )

        const searchInput = screen.getByPlaceholderText('Search logs…')
        await user.type(searchInput, 'test')
        expect(searchInput).toHaveValue('test')

        const clearBtn = within(searchInput.parentElement!).getByRole('button')
        await user.click(clearBtn)

        expect(searchInput).toHaveValue('')
    })

    test('clicking level chip filters by that level', async () => {
        const user = userEvent.setup()
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.serverLogs.getRecent).mockResolvedValue({
            data: { logs: mockLogs, total: 3 },
        } as any)
        vi.mocked(api.serverLogs.getByType).mockResolvedValue({
            data: { logs: [mockLogs[0]], total: 1 },
        } as any)

        renderPage()
        await waitFor(() =>
            expect(
                screen.getByText('User joined the server'),
            ).toBeInTheDocument(),
        )

        const infoChip = screen
            .getAllByRole('button')
            .find((btn) => btn.querySelector('p')?.textContent === 'info')
        expect(infoChip).toBeDefined()
        await user.click(infoChip!)

        await waitFor(() => {
            expect(api.serverLogs.getByType).toHaveBeenCalledWith(
                mockGuild.id,
                'info',
                expect.any(Number),
            )
        })
    })

    test('exports logs as JSON when export button clicked', async () => {
        const user = userEvent.setup()
        const { toast } = await import('sonner')
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.serverLogs.getRecent).mockResolvedValue({
            data: { logs: mockLogs, total: 3 },
        } as any)

        const createObjectURL = vi
            .spyOn(URL, 'createObjectURL')
            .mockReturnValue('blob:test')
        const revokeObjectURL = vi
            .spyOn(URL, 'revokeObjectURL')
            .mockImplementation(() => {})
        const anchorClick = vi
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(() => {})

        renderPage()
        await waitFor(() =>
            expect(
                screen.getByText('User joined the server'),
            ).toBeInTheDocument(),
        )

        await user.click(screen.getByText('Export'))

        expect(createObjectURL).toHaveBeenCalled()
        expect(anchorClick).toHaveBeenCalled()
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
        expect(toast.success).toHaveBeenCalledWith('Logs exported!')

        createObjectURL.mockRestore()
        revokeObjectURL.mockRestore()
        anchorClick.mockRestore()
    })

    test('navigates to next and previous pages', async () => {
        const user = userEvent.setup()
        mockGuildStoreFn(mockGuild)
        vi.mocked(api.serverLogs.getRecent).mockResolvedValue({
            data: { logs: mockLogs, total: 50 },
        } as any)

        renderPage()
        await waitFor(() =>
            expect(
                screen.getByText('User joined the server'),
            ).toBeInTheDocument(),
        )

        expect(screen.getByText('1/2')).toBeInTheDocument()
        const [prevBtn, nextBtn] = within(
            screen.getByText('1/2').parentElement!,
        ).getAllByRole('button')
        expect(prevBtn).toBeDisabled()

        await user.click(nextBtn)
        await waitFor(() => expect(screen.getByText('2/2')).toBeInTheDocument())

        const [prevBtn2] = within(
            screen.getByText('2/2').parentElement!,
        ).getAllByRole('button')
        await user.click(prevBtn2)
        await waitFor(() => expect(screen.getByText('1/2')).toBeInTheDocument())
    })
})
