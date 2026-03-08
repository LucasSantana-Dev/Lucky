import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ServerLogsPage from './ServerLogs'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'

vi.mock('@/services/api')
vi.mock('@/stores/guildStore')
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

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
        expect(
            screen.getByPlaceholderText('Search logs...'),
        ).toBeInTheDocument()
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
})
