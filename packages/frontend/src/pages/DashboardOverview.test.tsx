import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashboardOverview from './DashboardOverview'
import { useGuildStore } from '@/stores/guildStore'
import {
    useModerationStats,
    useModerationCases,
} from '@/hooks/useModerationQueries'

vi.mock('@/stores/guildStore')
vi.mock('@/hooks/useModerationQueries')

const mockGuild = {
    id: '123',
    name: 'Test Guild',
    memberCount: 150,
    effectiveAccess: {
        overview: 'manage',
        settings: 'manage',
        moderation: 'manage',
        automation: 'manage',
        music: 'manage',
        integrations: 'manage',
    },
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

function mockGuildStoreFn(guild: typeof mockGuild | null) {
    vi.mocked(useGuildStore).mockReturnValue({
        guilds: guild ? [guild] : [],
        selectedGuild: guild as any,
        memberContext: null,
        memberContextLoading: false,
        selectedGuildId: guild?.id ?? null,
        selectGuild: vi.fn(),
        setSelectedGuild: vi.fn(),
        fetchMemberContext: vi.fn(),
        getSelectedGuild: vi.fn(),
        isLoading: false,
        fetchGuilds: vi.fn(),
        serverSettings: null,
        serverListing: null,
        updateServerSettings: vi.fn(),
        updateServerListing: vi.fn(),
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
        vi.mocked(useModerationStats).mockReturnValue({
            data: null,
            isLoading: false,
        } as any)
        vi.mocked(useModerationCases).mockReturnValue({
            data: null,
            isLoading: false,
        } as any)
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
        renderPage()
        const skeletons = document.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    test('renders stat cards when loaded', () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(useModerationStats).mockReturnValue({
            data: mockStats,
            isLoading: false,
        } as any)
        vi.mocked(useModerationCases).mockReturnValue({
            data: { cases: mockCases },
            isLoading: false,
        } as any)
        renderPage()
        expect(screen.getByText('Total Members')).toBeInTheDocument()
        expect(screen.getByText('Active Cases')).toBeInTheDocument()
        expect(screen.getByText('Total Cases')).toBeInTheDocument()
        expect(screen.getByText('Auto-Mod Actions')).toBeInTheDocument()
    })

    test('shows member count from guild', () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(useModerationStats).mockReturnValue({
            data: mockStats,
            isLoading: false,
        } as any)
        vi.mocked(useModerationCases).mockReturnValue({
            data: { cases: mockCases },
            isLoading: false,
        } as any)
        renderPage()
        expect(screen.getByText('150')).toBeInTheDocument()
    })

    test('renders header with guild name', () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(useModerationStats).mockReturnValue({
            data: mockStats,
            isLoading: false,
        } as any)
        vi.mocked(useModerationCases).mockReturnValue({
            data: { cases: mockCases },
            isLoading: false,
        } as any)
        renderPage()
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
        expect(screen.getByText(/Overview of Test Guild/)).toBeInTheDocument()
    })

    test('renders recent cases', () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(useModerationStats).mockReturnValue({
            data: mockStats,
            isLoading: false,
        } as any)
        vi.mocked(useModerationCases).mockReturnValue({
            data: { cases: mockCases },
            isLoading: false,
        } as any)
        renderPage()
        expect(screen.getByText('Recent Cases')).toBeInTheDocument()
        expect(screen.getByText('TestUser')).toBeInTheDocument()
    })

    test('shows empty cases message when no cases', () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(useModerationStats).mockReturnValue({
            data: mockStats,
            isLoading: false,
        } as any)
        vi.mocked(useModerationCases).mockReturnValue({
            data: { cases: [] },
            isLoading: false,
        } as any)
        renderPage()
        expect(screen.getByText('No moderation cases yet')).toBeInTheDocument()
    })

    test('renders quick action links', () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(useModerationStats).mockReturnValue({
            data: mockStats,
            isLoading: false,
        } as any)
        vi.mocked(useModerationCases).mockReturnValue({
            data: { cases: mockCases },
            isLoading: false,
        } as any)
        renderPage()
        expect(screen.getByText('Quick Actions')).toBeInTheDocument()
        expect(screen.getByText('Moderation Cases')).toBeInTheDocument()
        expect(screen.getByText('Auto-Moderation')).toBeInTheDocument()
        expect(screen.getByText('Server Logs')).toBeInTheDocument()
        expect(screen.getByText('Custom Commands')).toBeInTheDocument()
    })

    test('renders cases by type breakdown when stats available', () => {
        mockGuildStoreFn(mockGuild)
        vi.mocked(useModerationStats).mockReturnValue({
            data: mockStats,
            isLoading: false,
        } as any)
        vi.mocked(useModerationCases).mockReturnValue({
            data: { cases: mockCases },
            isLoading: false,
        } as any)
        renderPage()
        expect(screen.getByText('Cases by Type')).toBeInTheDocument()
    })
})
