import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ModerationPage from './Moderation'
import { api } from '@/services/api'
import { useGuildStore } from '@/stores/guildStore'

vi.mock('@/services/api')
vi.mock('@/stores/guildStore')

const mockGuild = { id: '123', name: 'Test Server', botAdded: true }

const mockCases = [
    {
        id: 'c1',
        caseNumber: 1,
        guildId: '123',
        userId: 'user1',
        userName: 'TestUser',
        moderatorId: 'mod1',
        moderatorName: 'TestMod',
        type: 'warn',
        reason: 'Spamming in general',
        duration: null,
        active: true,
        appealed: false,
        createdAt: new Date().toISOString(),
    },
    {
        id: 'c2',
        caseNumber: 2,
        guildId: '123',
        userId: 'user2',
        userName: 'BadUser',
        moderatorId: 'mod1',
        moderatorName: 'TestMod',
        type: 'ban',
        reason: 'Repeated violations',
        duration: 86400,
        active: true,
        appealed: false,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
        id: 'c3',
        caseNumber: 3,
        guildId: '123',
        userId: 'user3',
        userName: 'ExpiredUser',
        moderatorId: 'mod2',
        moderatorName: 'OtherMod',
        type: 'mute',
        reason: 'Timeout for disruption',
        duration: 3600,
        active: false,
        appealed: true,
        createdAt: new Date(Date.now() - 172800000).toISOString(),
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

function renderPage() {
    return render(
        <MemoryRouter>
            <ModerationPage />
        </MemoryRouter>,
    )
}

describe('ModerationPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows no server selected message when no guild selected', () => {
        mockGuildStore(null)
        renderPage()

        expect(screen.getByText('No Server Selected')).toBeInTheDocument()
        expect(
            screen.getByText('Select a server to view moderation cases'),
        ).toBeInTheDocument()
    })

    test('shows loading skeletons while fetching', () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.moderation.getCases).mockReturnValue(
            new Promise(() => {}),
        )

        renderPage()

        const skeletons = document.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    test('renders cases list on success', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.moderation.getCases).mockResolvedValue({
            data: { cases: mockCases, total: 3 },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('TestUser')).toBeInTheDocument()
        })

        expect(screen.getByText('BadUser')).toBeInTheDocument()
        expect(screen.getByText('ExpiredUser')).toBeInTheDocument()
        expect(screen.getAllByText('TestMod').length).toBe(2)
    })

    test('shows empty state when no cases found', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.moderation.getCases).mockResolvedValue({
            data: { cases: [], total: 0 },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('No cases found')).toBeInTheDocument()
        })

        expect(
            screen.getByText('Moderation cases will appear here'),
        ).toBeInTheDocument()
    })

    test('shows empty state on API error', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.moderation.getCases).mockRejectedValue(
            new Error('Network error'),
        )

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('No cases found')).toBeInTheDocument()
        })
    })

    test('search input filters cases with debounce', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.moderation.getCases).mockResolvedValue({
            data: { cases: mockCases, total: 3 },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('TestUser')).toBeInTheDocument()
        })

        const searchInput = screen.getByPlaceholderText(
            'Search by user, moderator, or reason...',
        )
        await user.type(searchInput, 'spam')

        await waitFor(
            () => {
                expect(api.moderation.getCases).toHaveBeenCalledWith('123', {
                    page: 1,
                    limit: 15,
                    search: 'spam',
                })
            },
            { timeout: 500 },
        )
    })

    test('clear search button resets search query', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.moderation.getCases).mockResolvedValue({
            data: { cases: mockCases, total: 3 },
        } as any)

        renderPage()

        const searchInput = screen.getByPlaceholderText(
            'Search by user, moderator, or reason...',
        )
        await user.type(searchInput, 'test')

        const clearButton = screen.getByRole('button', { name: '' })
        await user.click(clearButton)

        expect(searchInput).toHaveValue('')
    })

    test.skip('type filter dropdown filters cases', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.moderation.getCases).mockResolvedValue({
            data: { cases: mockCases, total: 3 },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('TestUser')).toBeInTheDocument()
        })

        const filterTrigger = screen.getByRole('combobox')
        await user.click(filterTrigger)

        const warnOption = await screen.findByText('Warnings')
        await user.click(warnOption)

        await waitFor(() => {
            expect(api.moderation.getCases).toHaveBeenCalledWith('123', {
                page: 1,
                limit: 15,
                type: 'warn',
            })
        })
    })

    test('clicking case row opens detail modal', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.moderation.getCases).mockResolvedValue({
            data: { cases: mockCases, total: 3 },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('TestUser')).toBeInTheDocument()
        })

        const caseRow = screen.getByText('TestUser').closest('div')
        await user.click(caseRow!)

        expect(screen.getByText('Case #1')).toBeInTheDocument()
        expect(screen.getAllByText('TestUser').length).toBeGreaterThan(1)
    })

    test('shows pagination when total exceeds limit', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.moderation.getCases).mockResolvedValue({
            data: { cases: mockCases, total: 30 },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Showing 1-15 of 30')).toBeInTheDocument()
        })

        expect(screen.getByText('1 / 2')).toBeInTheDocument()
    })

    test('pagination next button fetches next page', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.moderation.getCases).mockResolvedValue({
            data: { cases: mockCases, total: 30 },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('1 / 2')).toBeInTheDocument()
        })

        const paginationButtons = screen
            .getByText('1 / 2')
            .parentElement!.querySelectorAll('button')
        const nextButton = paginationButtons[1]
        await user.click(nextButton!)

        await waitFor(() => {
            expect(api.moderation.getCases).toHaveBeenCalledWith('123', {
                page: 2,
                limit: 15,
            })
        })
    })

    test('pagination previous button is disabled on first page', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.moderation.getCases).mockResolvedValue({
            data: { cases: mockCases, total: 30 },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('1 / 2')).toBeInTheDocument()
        })

        const buttons = screen.getAllByRole('button')
        const prevButton = buttons.find((btn) => btn.disabled)
        expect(prevButton).toBeDefined()
    })

    test('displays case type badges correctly', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.moderation.getCases).mockResolvedValue({
            data: { cases: mockCases, total: 3 },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('warn')).toBeInTheDocument()
        })

        expect(screen.getByText('ban')).toBeInTheDocument()
        expect(screen.getByText('mute')).toBeInTheDocument()
    })

    test('displays active and expired status correctly', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.moderation.getCases).mockResolvedValue({
            data: { cases: mockCases, total: 3 },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getAllByText('Active').length).toBe(2)
        })

        expect(screen.getByText('Expired')).toBeInTheDocument()
    })

    test('modal shows duration for timed cases', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.moderation.getCases).mockResolvedValue({
            data: { cases: mockCases, total: 3 },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('BadUser')).toBeInTheDocument()
        })

        const banCase = screen.getByText('BadUser').closest('div')
        await user.click(banCase!)

        expect(screen.getByText(/Duration: 1440 minutes/)).toBeInTheDocument()
    })

    test('modal shows appealed badge for appealed cases', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.moderation.getCases).mockResolvedValue({
            data: { cases: mockCases, total: 3 },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('ExpiredUser')).toBeInTheDocument()
        })

        const muteCase = screen.getByText('ExpiredUser').closest('div')
        await user.click(muteCase!)

        expect(screen.getByText('Appealed')).toBeInTheDocument()
    })

    test('empty state shows adjusted message when filters are active', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.moderation.getCases).mockResolvedValue({
            data: { cases: [], total: 0 },
        } as any)

        renderPage()

        const user = userEvent.setup()
        const searchInput = await screen.findByPlaceholderText(
            'Search by user, moderator, or reason...',
        )
        await user.type(searchInput, 'nonexistent')

        await waitFor(() => {
            expect(
                screen.getByText('Try adjusting your filters'),
            ).toBeInTheDocument()
        })
    })

    test.skip('resetting filters resets page to 1', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.moderation.getCases).mockResolvedValue({
            data: { cases: mockCases, total: 30 },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('1 / 2')).toBeInTheDocument()
        })

        const nextButton = screen
            .getAllByRole('button')
            .find((btn) => btn.querySelector('svg'))
        await user.click(nextButton!)

        const filterTrigger = screen.getByRole('combobox')
        await user.click(filterTrigger)

        const banOption = await screen.findByText('Bans')
        await user.click(banOption)

        await waitFor(() => {
            expect(api.moderation.getCases).toHaveBeenCalledWith('123', {
                page: 1,
                limit: 15,
                type: 'ban',
            })
        })
    })
})
