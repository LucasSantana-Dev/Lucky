import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashboardOverview from './DashboardOverview'
import { useGuildStore } from '@/stores/guildStore'
import {
    useModerationStats,
    useModerationCases,
} from '@/hooks/useModerationQueries'
import { useRecentTracks } from '@/hooks/useTrackHistoryQueries'
import { useLevelLeaderboard } from '@/hooks/useLevelQueries'
import { useStarboardTop } from '@/hooks/useStarboardQueries'

vi.mock('@/stores/guildStore')
vi.mock('@/hooks/useModerationQueries')
vi.mock('@/hooks/useTrackHistoryQueries')
vi.mock('@/hooks/useLevelQueries')
vi.mock('@/hooks/useStarboardQueries')

const mockGuild = { id: '123', name: 'Test Guild', memberCount: 150 }

const mockStats = {
    totalCases: 25,
    activeCases: 5,
    recentCases: 3,
    casesByType: { warn: 10, mute: 8, kick: 4, ban: 3 },
}

const mockCases = [
    {
        id: 'c1',
        caseNumber: 1,
        type: 'warn',
        userName: 'TestUser',
        userId: 'u1',
        moderatorName: 'Mod',
        reason: 'Spam',
        active: true,
        createdAt: new Date().toISOString(),
    },
]

const mockTracks = [
    {
        id: 't1',
        title: 'Test Track',
        author: 'Test Artist',
        playedBy: 'u1',
        timestamp: new Date().toISOString(),
    },
]

const mockLeaderboard = [
    {
        userId: 'u1',
        level: 5,
        xp: 500,
    },
    {
        userId: 'u2',
        level: 4,
        xp: 300,
    },
]

const mockStarboardEntries = [
    {
        id: 's1',
        guildId: '123',
        messageId: 'm1',
        channelId: 'c1',
        authorId: 'u1',
        starboardMsgId: 'sm1',
        starCount: 10,
        content: 'Test message',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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

function setupQueryHookMocks(
    statsData: any = null,
    casesData: any = null,
    tracksData: any = null,
    leaderboardData: any = null,
    starboardData: any = null,
) {
    vi.mocked(useModerationStats).mockReturnValue({
        data: statsData,
        isLoading: false,
    } as any)
    vi.mocked(useModerationCases).mockReturnValue({
        data: casesData,
        isLoading: false,
    } as any)
    vi.mocked(useRecentTracks).mockReturnValue({
        data: tracksData,
        isLoading: false,
    } as any)
    vi.mocked(useLevelLeaderboard).mockReturnValue({
        data: leaderboardData,
        isLoading: false,
    } as any)
    vi.mocked(useStarboardTop).mockReturnValue({
        data: starboardData,
        isLoading: false,
    } as any)
}

const renderPage = () =>
    render(
        <MemoryRouter>
            <DashboardOverview />
        </MemoryRouter>,
    )

describe('DashboardOverview', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows select server when no guild', () => {
        mockGuildStoreFn(null)
        setupQueryHookMocks()
        renderPage()
        expect(screen.getByText('Select a Server')).toBeInTheDocument()
        expect(
            screen.getByText(
                'Choose a server from the sidebar to view its dashboard',
            ),
        ).toBeInTheDocument()
    })

    test('shows loading skeletons when loading', () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(useModerationStats).mockReturnValue({
            data: null,
            isLoading: true,
        } as any)
        vi.mocked(useModerationCases).mockReturnValue({
            data: null,
            isLoading: true,
        } as any)
        vi.mocked(useRecentTracks).mockReturnValue({
            data: null,
            isLoading: true,
        } as any)
        vi.mocked(useLevelLeaderboard).mockReturnValue({
            data: null,
            isLoading: true,
        } as any)
        vi.mocked(useStarboardTop).mockReturnValue({
            data: null,
            isLoading: true,
        } as any)
        renderPage()
        const skeletons = document.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    test('renders stat cards when loaded', () => {
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            mockStats,
            { cases: mockCases },
            mockTracks,
            mockLeaderboard,
            mockStarboardEntries,
        )
        renderPage()
        expect(screen.getByText('Total Members')).toBeInTheDocument()
        expect(screen.getByText('Active Cases')).toBeInTheDocument()
        expect(screen.getByText('Total Cases')).toBeInTheDocument()
        expect(screen.getByText('Auto-Mod Actions')).toBeInTheDocument()
    })

    test('shows member count from guild', () => {
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            mockStats,
            { cases: mockCases },
            mockTracks,
            mockLeaderboard,
            mockStarboardEntries,
        )
        renderPage()
        expect(screen.getByText('150')).toBeInTheDocument()
    })

    test('renders header with guild name', () => {
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            mockStats,
            { cases: mockCases },
            mockTracks,
            mockLeaderboard,
            mockStarboardEntries,
        )
        renderPage()
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
        expect(screen.getByText(/Overview of Test Guild/)).toBeInTheDocument()
    })

    test('renders recent cases', () => {
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            mockStats,
            { cases: mockCases },
            mockTracks,
            mockLeaderboard,
            mockStarboardEntries,
        )
        renderPage()
        expect(screen.getByText('Recent Cases')).toBeInTheDocument()
        expect(screen.getByText('TestUser')).toBeInTheDocument()
    })

    test('shows empty cases message when no cases', () => {
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            mockStats,
            { cases: [] },
            mockTracks,
            mockLeaderboard,
            mockStarboardEntries,
        )
        renderPage()
        expect(screen.getByText('No moderation cases yet')).toBeInTheDocument()
    })

    test('renders quick action links', () => {
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            mockStats,
            { cases: mockCases },
            mockTracks,
            mockLeaderboard,
            mockStarboardEntries,
        )
        renderPage()
        expect(screen.getByText('Quick Actions')).toBeInTheDocument()
        expect(screen.getByText('Moderation Cases')).toBeInTheDocument()
        expect(screen.getByText('Auto-Moderation')).toBeInTheDocument()
        expect(screen.getByText('Server Logs')).toBeInTheDocument()
        expect(screen.getByText('Custom Commands')).toBeInTheDocument()
    })

    test('renders cases by type breakdown when stats available', () => {
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            mockStats,
            { cases: mockCases },
            mockTracks,
            mockLeaderboard,
            mockStarboardEntries,
        )
        renderPage()
        expect(screen.getByText('Cases by Type')).toBeInTheDocument()
    })
})
