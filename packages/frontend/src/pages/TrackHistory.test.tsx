import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import TrackHistoryPage from './TrackHistory'
import { api } from '@/services/api'

vi.mock('@/services/api')
vi.mock('@/hooks/useGuildSelection')

const mockGuild = { id: '123', name: 'Test Server', botAdded: true }

const mockHistory = [
    {
        trackId: 't1',
        title: 'Never Gonna Give You Up',
        author: 'Rick Astley',
        duration: '3:32',
        url: 'https://example.com/t1',
        timestamp: Date.now() - 120000,
    },
    {
        trackId: 't2',
        title: 'Bohemian Rhapsody',
        author: 'Queen',
        duration: '5:55',
        url: 'https://example.com/t2',
        timestamp: Date.now() - 3600000,
    },
]

const mockStats = {
    totalTracks: 42,
    totalPlayTime: 7200,
    topArtists: [
        { artist: 'Queen', plays: 15 },
        { artist: 'Rick Astley', plays: 10 },
    ],
    topTracks: [
        { trackId: 't2', title: 'Bohemian Rhapsody', plays: 8 },
        { trackId: 't1', title: 'Never Gonna Give You Up', plays: 5 },
    ],
    lastUpdated: new Date().toISOString(),
}

import { useGuildSelection } from '@/hooks/useGuildSelection'

function mockGuildSelection(guild: typeof mockGuild | null) {
    vi.mocked(useGuildSelection).mockReturnValue({
        guilds: guild
            ? [
                  {
                      ...guild,
                      icon: null,
                      owner: true,
                      permissions: '8',
                      features: [],
                  },
              ]
            : [],
        selectedGuild: guild
            ? ({
                  ...guild,
                  icon: null,
                  owner: true,
                  permissions: '8',
                  features: [],
              } as any)
            : null,
        selectGuild: vi.fn(),
    })
}

function renderPage() {
    return render(
        <MemoryRouter>
            <TrackHistoryPage />
        </MemoryRouter>,
    )
}

describe('TrackHistoryPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows select server message when no guild selected', () => {
        mockGuildSelection(null)
        renderPage()

        expect(
            screen.getByText('Select a server to view track history'),
        ).toBeInTheDocument()
    })

    test('shows loading skeletons while fetching', () => {
        mockGuildSelection(mockGuild)
        vi.mocked(api.trackHistory.getHistory).mockReturnValue(
            new Promise(() => {}),
        )
        vi.mocked(api.trackHistory.getStats).mockReturnValue(
            new Promise(() => {}),
        )

        renderPage()

        const skeletons = document.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    test('renders stats cards and track list on success', async () => {
        mockGuildSelection(mockGuild)
        vi.mocked(api.trackHistory.getHistory).mockResolvedValue({
            data: { history: mockHistory },
        } as any)
        vi.mocked(api.trackHistory.getStats).mockResolvedValue({
            data: { stats: mockStats },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Track History')).toBeInTheDocument()
        })

        expect(screen.getByText('42')).toBeInTheDocument()
        expect(screen.getByText('Tracks Played')).toBeInTheDocument()
        expect(screen.getByText('2h 0m')).toBeInTheDocument()
        expect(screen.getAllByText('Queen').length).toBeGreaterThanOrEqual(1)
        expect(
            screen.getAllByText('Never Gonna Give You Up').length,
        ).toBeGreaterThanOrEqual(1)
        expect(screen.getByText('Rick Astley · 3:32')).toBeInTheDocument()
    })

    test('renders ranking cards for top tracks and artists', async () => {
        mockGuildSelection(mockGuild)
        vi.mocked(api.trackHistory.getHistory).mockResolvedValue({
            data: { history: mockHistory },
        } as any)
        vi.mocked(api.trackHistory.getStats).mockResolvedValue({
            data: { stats: mockStats },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Top Tracks')).toBeInTheDocument()
        })

        expect(screen.getByText('Top Artists')).toBeInTheDocument()
    })

    test('shows error message on fetch failure', async () => {
        mockGuildSelection(mockGuild)
        vi.mocked(api.trackHistory.getHistory).mockRejectedValue(
            new Error('Network error'),
        )
        vi.mocked(api.trackHistory.getStats).mockRejectedValue(
            new Error('Network error'),
        )

        renderPage()

        await waitFor(() => {
            expect(
                screen.getByText('Failed to load track history'),
            ).toBeInTheDocument()
        })
    })

    test('shows empty state when no tracks played', async () => {
        mockGuildSelection(mockGuild)
        vi.mocked(api.trackHistory.getHistory).mockResolvedValue({
            data: { history: [] },
        } as any)
        vi.mocked(api.trackHistory.getStats).mockResolvedValue({
            data: { stats: null },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('No tracks played yet')).toBeInTheDocument()
        })
    })

    test('clear button calls clearHistory and resets state', async () => {
        const user = userEvent.setup()
        mockGuildSelection(mockGuild)
        vi.mocked(api.trackHistory.getHistory).mockResolvedValue({
            data: { history: mockHistory },
        } as any)
        vi.mocked(api.trackHistory.getStats).mockResolvedValue({
            data: { stats: mockStats },
        } as any)
        vi.mocked(api.trackHistory.clearHistory).mockResolvedValue({
            data: { success: true },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Clear')).toBeInTheDocument()
        })

        await user.click(screen.getByText('Clear'))

        expect(api.trackHistory.clearHistory).toHaveBeenCalledWith('123')
    })

    test('track links open in new tab', async () => {
        mockGuildSelection(mockGuild)
        vi.mocked(api.trackHistory.getHistory).mockResolvedValue({
            data: { history: mockHistory },
        } as any)
        vi.mocked(api.trackHistory.getStats).mockResolvedValue({
            data: { stats: mockStats },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Recent Tracks')).toBeInTheDocument()
        })

        const links = screen.getAllByText('Never Gonna Give You Up')
        const trackLink = links.find((el) => el.closest('a'))
        expect(trackLink).toBeDefined()
        expect(trackLink!.closest('a')).toHaveAttribute('target', '_blank')
        expect(trackLink!.closest('a')).toHaveAttribute(
            'rel',
            'noopener noreferrer',
        )
    })

    test('shows load-more button and track count when more tracks available', async () => {
        const user = userEvent.setup()
        mockGuildSelection(mockGuild)
        vi.mocked(api.trackHistory.getHistory)
            .mockResolvedValueOnce({
                data: { history: mockHistory, total: 10 },
            } as any)
            .mockResolvedValueOnce({
                data: { history: [], total: 10 },
            } as any)
        vi.mocked(api.trackHistory.getStats).mockResolvedValue({
            data: { stats: mockStats },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Load More Tracks')).toBeInTheDocument()
        })

        expect(screen.getByText(/Showing 2 of 10/)).toBeInTheDocument()

        await user.click(screen.getByText('Load More Tracks'))

        expect(api.trackHistory.getHistory).toHaveBeenCalledTimes(2)
    })

    test('hides load-more button when all tracks are loaded', async () => {
        mockGuildSelection(mockGuild)
        vi.mocked(api.trackHistory.getHistory).mockResolvedValue({
            data: { history: mockHistory, total: 2 },
        } as any)
        vi.mocked(api.trackHistory.getStats).mockResolvedValue({
            data: { stats: mockStats },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Recent Tracks')).toBeInTheDocument()
        })

        expect(screen.queryByText('Load More Tracks')).not.toBeInTheDocument()
    })
})
