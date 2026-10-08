import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashboardOverview from './DashboardOverview'
import { useGuildStore } from '@/stores/guildStore'
import type { ModerationCase } from '@/types/moderation'
import {
    useModerationStats,
    useModerationCases,
} from '@/hooks/useModerationQueries'
import { useRecentTracks } from '@/hooks/useTrackHistoryQueries'
import { useLevelLeaderboard } from '@/hooks/useLevelQueries'

vi.mock('@/stores/guildStore')
vi.mock('@/hooks/useModerationQueries')
vi.mock('@/hooks/useTrackHistoryQueries')
vi.mock('@/hooks/useLevelQueries')

const useReducedMotionMock = vi.hoisted(() => vi.fn(() => false))
vi.mock('framer-motion', async () => {
    const actual =
        await vi.importActual<typeof import('framer-motion')>('framer-motion')
    return { ...actual, useReducedMotion: useReducedMotionMock }
})

type AccessValue = 'none' | 'view' | 'manage'
type AccessMap = Record<
    | 'overview'
    | 'settings'
    | 'moderation'
    | 'automation'
    | 'music'
    | 'integrations',
    AccessValue
>

const fullAccess: AccessMap = {
    overview: 'manage',
    settings: 'manage',
    moderation: 'manage',
    automation: 'manage',
    music: 'manage',
    integrations: 'manage',
}

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

const mockCases: ModerationCase[] = [
    {
        id: 'c1',
        caseNumber: 1,
        guildId: '123',
        type: 'warn',
        username: 'TestUser',
        userId: 'u1',
        moderatorId: 'mod1',
        moderatorName: 'Mod',
        reason: 'Spam',
        duration: null,
        expiresAt: null,
        active: true,
        appealed: false,
        appealReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
        const { container } = renderPage()
        expect(screen.getByText('Select a Server')).toBeInTheDocument()
        expect(
            screen.getByText(
                'Choose a server from the sidebar to view its dashboard',
            ),
        ).toBeInTheDocument()
        expect(container.querySelectorAll('h1')).toHaveLength(1)
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
        )
        renderPage()
        expect(screen.getByText('150')).toBeInTheDocument()
    })

    test('shows zero member count when guild memberCount is missing', () => {
        mockGuildStoreFn({ ...mockGuild, memberCount: 0 })
        setupQueryHookMocks(
            mockStats,
            { cases: mockCases },
            mockTracks,
            mockLeaderboard,
        )
        renderPage()
        expect(screen.getByText('Total Members')).toBeInTheDocument()
        expect(screen.getByText('0')).toBeInTheDocument()
    })

    test('renders KPI compact stats with icons for each tone', () => {
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            {
                ...mockStats,
                activeCases: 7,
                totalCases: 142,
                casesByType: { ...mockStats.casesByType, warn: 64 },
            },
            { cases: mockCases },
            mockTracks,
            mockLeaderboard,
        )
        renderPage()
        expect(screen.getByText('7')).toBeInTheDocument()
        expect(screen.getByText('142')).toBeInTheDocument()
        expect(screen.getAllByText('64').length).toBeGreaterThanOrEqual(1)
    })

    test('uses fallback 0 for KPI compact stats when stats missing', () => {
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            undefined,
            { cases: mockCases },
            mockTracks,
            mockLeaderboard,
        )
        renderPage()
        const zeros = screen.getAllByText('0')
        expect(zeros.length).toBeGreaterThanOrEqual(3)
    })

    test('renders header with guild name', () => {
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            mockStats,
            { cases: mockCases },
            mockTracks,
            mockLeaderboard,
        )
        renderPage()
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
        expect(screen.getByText(/Overview of Test Guild/)).toBeInTheDocument()
    })

    test('renders exactly one h1', () => {
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            mockStats,
            { cases: mockCases },
            mockTracks,
            mockLeaderboard,
        )
        renderPage()
        expect(document.querySelectorAll('h1')).toHaveLength(1)
    })

    test('renders recent cases', () => {
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            mockStats,
            { cases: mockCases },
            mockTracks,
            mockLeaderboard,
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
        )
        renderPage()
        expect(screen.getByText('Quick Actions')).toBeInTheDocument()
        expect(screen.getByText('Moderation Cases')).toBeInTheDocument()
        expect(screen.getByText('Auto-Moderation')).toBeInTheDocument()
        expect(screen.getByText('Server Logs')).toBeInTheDocument()
    })

    test('renders every quick action row with title and description', () => {
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            mockStats,
            { cases: mockCases },
            mockTracks,
            mockLeaderboard,
        )
        renderPage()
        const quickActionLabels = [
            ['Moderation Cases', 'Review warnings, mutes, kicks, and bans.'],
            ['Auto-Moderation', 'Tune filters and anti-spam automation.'],
            ['Server Logs', 'Audit events and moderation activity.'],
            ['Music Player', 'View queue, playback, and track history.'],
            ['Levels & XP', 'Configure XP, level rewards, and leaderboards.'],
        ] as const
        for (const [title, description] of quickActionLabels) {
            expect(screen.getByText(title)).toBeInTheDocument()
            expect(screen.getByText(description)).toBeInTheDocument()
        }
    })

    test('renders hero KPI total members context line', () => {
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            mockStats,
            { cases: mockCases },
            mockTracks,
            mockLeaderboard,
        )
        renderPage()
        expect(
            screen.getByText(/Active members across Test Guild/),
        ).toBeInTheDocument()
    })

    test('respects prefersReducedMotion=true (skips entrance animations)', () => {
        useReducedMotionMock.mockReturnValueOnce(true)
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            mockStats,
            { cases: mockCases },
            mockTracks,
            mockLeaderboard,
        )
        renderPage()
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
        expect(screen.getByText('Recent Cases')).toBeInTheDocument()
    })

    test('shows the username instead of the user id when username is set', () => {
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            mockStats,
            { cases: mockCases },
            mockTracks,
            mockLeaderboard,
        )
        renderPage()
        expect(screen.getByText('TestUser')).toBeInTheDocument()
    })

    test('falls back to userId and reason placeholder when case fields are blank', () => {
        const bareCase = {
            ...mockCases[0],
            id: 'bare',
            caseNumber: 9100,
            username: '',
            userId: 'raw-user-id-1234',
            reason: null,
            createdAt: new Date().toISOString(),
        }
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            mockStats,
            { cases: [bareCase] },
            mockTracks,
            mockLeaderboard,
        )
        renderPage()
        expect(screen.getByText('raw-user-id-1234')).toBeInTheDocument()
        expect(screen.getByText('No reason provided')).toBeInTheDocument()
    })

    test('formats case timestamps across timeAgo() ranges', () => {
        const now = Date.now()
        const casesAcrossRanges = [
            {
                ...mockCases[0],
                id: 'c-just',
                caseNumber: 9001,
                createdAt: new Date(now).toISOString(),
            },
            {
                ...mockCases[0],
                id: 'c-min',
                caseNumber: 9002,
                createdAt: new Date(now - 5 * 60_000).toISOString(),
            },
            {
                ...mockCases[0],
                id: 'c-hour',
                caseNumber: 9003,
                createdAt: new Date(now - 2 * 3_600_000).toISOString(),
            },
            {
                ...mockCases[0],
                id: 'c-day',
                caseNumber: 9004,
                createdAt: new Date(now - 3 * 86_400_000).toISOString(),
            },
            {
                ...mockCases[0],
                id: 'c-week',
                caseNumber: 9005,
                createdAt: new Date(now - 14 * 86_400_000).toISOString(),
            },
        ]
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            mockStats,
            { cases: casesAcrossRanges },
            mockTracks,
            mockLeaderboard,
        )
        renderPage()
        expect(screen.getAllByText('Just now').length).toBeGreaterThanOrEqual(1)
        expect(screen.getByText('5m ago')).toBeInTheDocument()
        expect(screen.getByText('2h ago')).toBeInTheDocument()
        expect(screen.getByText('3d ago')).toBeInTheDocument()
        expect(screen.getByText('#9005')).toBeInTheDocument()
    })

    test('renders cases by type breakdown when stats available', () => {
        mockGuildStoreFn(mockGuild)
        setupQueryHookMocks(
            mockStats,
            { cases: mockCases },
            mockTracks,
            mockLeaderboard,
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
            )
            renderPage()
            expect(screen.getByText('Recent Music')).toBeInTheDocument()
            expect(screen.getByText('Test Track')).toBeInTheDocument()
            expect(screen.getByText('Another Track')).toBeInTheDocument()
        })

        test('renders fallback label when playedBy is missing', () => {
            mockGuildStoreFn(mockGuild)
            setupQueryHookMocks(
                mockStats,
                { cases: mockCases },
                mockTracks,
                mockLeaderboard,
            )
            renderPage()
            expect(screen.getByText('Unknown')).toBeInTheDocument()
        })

        test('renders empty music state when no tracks are returned', () => {
            mockGuildStoreFn(mockGuild)
            setupQueryHookMocks(
                mockStats,
                { cases: mockCases },
                [],
                mockLeaderboard,
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
            )
            renderPage()
            expect(screen.getByText('Level Leaderboard')).toBeInTheDocument()
            expect(screen.getByText('Lv5')).toBeInTheDocument()
            expect(screen.getByText('Lv4')).toBeInTheDocument()
        })

        test('renders empty leaderboard state when no members are returned', () => {
            mockGuildStoreFn(mockGuild)
            setupQueryHookMocks(mockStats, { cases: mockCases }, mockTracks, [])
            renderPage()
            expect(screen.getByText('No leaderboard data')).toBeInTheDocument()
        })

        test('renders loading skeletons for leaderboard while loading', () => {
            mockGuildStoreFn(mockGuild)
            setupQueryHookMocks(
                mockStats,
                { cases: mockCases },
                mockTracks,
                null,
            )
            vi.mocked(useLevelLeaderboard).mockReturnValue({
                data: null,
                isLoading: true,
            } as any)
            renderPage()
            expect(screen.getByText('Level Leaderboard')).toBeInTheDocument()
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
            )
            renderPage()
            expect(
                screen.queryByText('Level Leaderboard'),
            ).not.toBeInTheDocument()
        })
    })
})
