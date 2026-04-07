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

const fullAccess = {
    overview: 'manage',
    settings: 'manage',
    moderation: 'manage',
    automation: 'manage',
    music: 'manage',
    integrations: 'manage',
} as const

const mockGuild = {
    id: '123',
    name: 'Test Guild',
    memberCount: 150,
    effectiveAccess: fullAccess,
}

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
        trackId: 't1',
        title: 'Test Track',
        author: 'Test Artist',
        playedBy: 'u1',
        timestamp: new Date().toISOString(),
    },
    {
        trackId: 't2',
        title: 'Another Track',
        author: 'Another Artist',
        playedBy: '',
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

    describe('Recent Music section', () => {
        test('renders recent tracks when music access is granted and data is present', () => {
            mockGuildStoreFn(mockGuild)
            setupQueryHookMocks(
                mockStats,
                { cases: mockCases },
                mockTracks,
                mockLeaderboard,
                mockStarboardEntries,
            )
            renderPage()
            expect(screen.getByText('Recent Music')).toBeInTheDocument()
            expect(screen.getByText('Test Track')).toBeInTheDocument()
            expect(screen.getByText('Another Track')).toBeInTheDocument()
        })

        test('renders placeholder dash when playedBy is missing', () => {
            mockGuildStoreFn(mockGuild)
            setupQueryHookMocks(
                mockStats,
                { cases: mockCases },
                mockTracks,
                mockLeaderboard,
                mockStarboardEntries,
            )
            renderPage()
            expect(screen.getByText('—')).toBeInTheDocument()
        })

        test('renders empty music state when no tracks are returned', () => {
            mockGuildStoreFn(mockGuild)
            setupQueryHookMocks(
                mockStats,
                { cases: mockCases },
                [],
                mockLeaderboard,
                mockStarboardEntries,
            )
            renderPage()
            expect(screen.getByText('No tracks played yet')).toBeInTheDocument()
        })

        test('renders loading skeletons for recent music while tracks are loading', () => {
            mockGuildStoreFn(mockGuild)
            setupQueryHookMocks(
                mockStats,
                { cases: mockCases },
                null,
                mockLeaderboard,
                mockStarboardEntries,
            )
            vi.mocked(useRecentTracks).mockReturnValue({
                data: null,
                isLoading: true,
            } as any)
            renderPage()
            expect(screen.getByText('Recent Music')).toBeInTheDocument()
        })

        test('hides Recent Music section when music access is not granted', () => {
            mockGuildStoreFn({
                ...mockGuild,
                effectiveAccess: { ...fullAccess, music: 'none' },
            })
            setupQueryHookMocks(
                mockStats,
                { cases: mockCases },
                mockTracks,
                mockLeaderboard,
                mockStarboardEntries,
            )
            renderPage()
            expect(screen.queryByText('Recent Music')).not.toBeInTheDocument()
        })
    })

    describe('Community section', () => {
        test('renders leaderboard members when settings access is granted', () => {
            mockGuildStoreFn(mockGuild)
            setupQueryHookMocks(
                mockStats,
                { cases: mockCases },
                mockTracks,
                mockLeaderboard,
                mockStarboardEntries,
            )
            renderPage()
            expect(screen.getByText('Level Leaderboard')).toBeInTheDocument()
            expect(screen.getByText('Lv5')).toBeInTheDocument()
            expect(screen.getByText('Lv4')).toBeInTheDocument()
        })

        test('renders empty leaderboard state when no members are returned', () => {
            mockGuildStoreFn(mockGuild)
            setupQueryHookMocks(
                mockStats,
                { cases: mockCases },
                mockTracks,
                [],
                mockStarboardEntries,
            )
            renderPage()
            expect(screen.getByText('No leaderboard data')).toBeInTheDocument()
        })

        test('renders starboard highlights when entries are present', () => {
            mockGuildStoreFn(mockGuild)
            setupQueryHookMocks(
                mockStats,
                { cases: mockCases },
                mockTracks,
                mockLeaderboard,
                mockStarboardEntries,
            )
            renderPage()
            expect(screen.getByText('Starboard Highlights')).toBeInTheDocument()
        })

        test('renders empty starboard state when no entries are returned', () => {
            mockGuildStoreFn(mockGuild)
            setupQueryHookMocks(
                mockStats,
                { cases: mockCases },
                mockTracks,
                mockLeaderboard,
                [],
            )
            renderPage()
            expect(
                screen.getByText('No starred messages'),
            ).toBeInTheDocument()
        })

        test('renders loading skeletons for leaderboard while loading', () => {
            mockGuildStoreFn(mockGuild)
            setupQueryHookMocks(
                mockStats,
                { cases: mockCases },
                mockTracks,
                null,
                mockStarboardEntries,
            )
            vi.mocked(useLevelLeaderboard).mockReturnValue({
                data: null,
                isLoading: true,
            } as any)
            renderPage()
            expect(screen.getByText('Level Leaderboard')).toBeInTheDocument()
        })

        test('renders loading skeletons for starboard while loading', () => {
            mockGuildStoreFn(mockGuild)
            setupQueryHookMocks(
                mockStats,
                { cases: mockCases },
                mockTracks,
                mockLeaderboard,
                null,
            )
            vi.mocked(useStarboardTop).mockReturnValue({
                data: null,
                isLoading: true,
            } as any)
            renderPage()
            expect(screen.getByText('Starboard Highlights')).toBeInTheDocument()
        })

        test('hides Community section when settings access is not granted', () => {
            mockGuildStoreFn({
                ...mockGuild,
                effectiveAccess: { ...fullAccess, settings: 'none' },
            })
            setupQueryHookMocks(
                mockStats,
                { cases: mockCases },
                mockTracks,
                mockLeaderboard,
                mockStarboardEntries,
            )
            renderPage()
            expect(
                screen.queryByText('Level Leaderboard'),
            ).not.toBeInTheDocument()
            expect(
                screen.queryByText('Starboard Highlights'),
            ).not.toBeInTheDocument()
        })
    })
})
