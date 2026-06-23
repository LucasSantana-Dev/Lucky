import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuthStore } from '@/stores/authStore'
import { useGuildStore } from '@/stores/guildStore'
import type { User, Guild } from '@/types'
import type { EffectiveAccessMap } from '@/types/rbac'

vi.mock('@/stores/authStore')
vi.mock('@/stores/guildStore')

const mockUser: User = {
    id: '123456789',
    username: 'TestUser',
    discriminator: '1234',
    avatar: 'avatar123',
}

const mockGuild: Guild = {
    id: '987654321',
    name: 'Test Server',
    icon: 'icon123',
    owner: true,
    permissions: '8',
    features: [],
    botAdded: true,
}

const mockGuild2: Guild = {
    id: '111222333',
    name: 'Another Server',
    icon: null,
    owner: false,
    permissions: '0',
    features: [],
    botAdded: true,
}

const ACCESS_NONE: EffectiveAccessMap = {
    overview: 'none',
    settings: 'none',
    moderation: 'none',
    automation: 'none',
    music: 'none',
    integrations: 'none',
}

describe('Sidebar', () => {
    const mockLogout = vi.fn()
    const mockSelectGuild = vi.fn()
    const mockFetchGuilds = vi.fn()
    const mockSetSelectedGuild = vi.fn()
    const mockUpdateServerSettings = vi.fn()

    function mockGuildStoreState(
        overrides: Partial<ReturnType<typeof useGuildStore>>,
    ) {
        vi.mocked(useGuildStore).mockReturnValue({
            guilds: [mockGuild, mockGuild2],
            selectedGuild: mockGuild,
            selectedGuildId: mockGuild.id,
            isLoading: false,
            guildLoadError: null,
            memberContext: null,
            memberContextLoading: false,
            serverSettings: null,
            fetchGuilds: mockFetchGuilds,
            selectGuild: mockSelectGuild,
            fetchMemberContext: vi.fn(),
            setSelectedGuild: mockSetSelectedGuild,
            getSelectedGuild: vi.fn(),
            updateServerSettings: mockUpdateServerSettings,
            ...overrides,
        })
    }

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(useAuthStore).mockReturnValue({
            user: mockUser,
            isAuthenticated: true,
            isLoading: false,
            isDeveloper: false,
            login: vi.fn(),
            logout: mockLogout,
            checkAuth: vi.fn(),
            checkDeveloperStatus: vi.fn(),
        })
        mockGuildStoreState({})
    })

    const renderSidebar = (initialRoute = '/') => {
        return render(
            <MemoryRouter initialEntries={[initialRoute]}>
                <Sidebar />
            </MemoryRouter>,
        )
    }

    test('renders navigation links', () => {
        renderSidebar()

        expect(screen.getByText('Dashboard')).toBeInTheDocument()
        expect(screen.getByText('Server Settings')).toBeInTheDocument()
        expect(screen.getByText('Features')).toBeInTheDocument()
        expect(screen.getByText('Music Player')).toBeInTheDocument()
    })

    test('highlights active link based on current route', () => {
        renderSidebar('/features')

        const featuresLink = screen.getByText('Features').closest('a')
        const dashboardLink = screen.getByText('Dashboard').closest('a')

        expect(featuresLink).toHaveAttribute('aria-current', 'page')
        expect(featuresLink).toHaveAttribute('data-active', 'true')
        expect(dashboardLink).not.toHaveAttribute('aria-current')
        expect(dashboardLink).toHaveAttribute('data-active', 'false')
    })

    test('activates parent route for sub-routes using slash boundary', () => {
        renderSidebar('/music/history')

        const musicLink = screen.getByText('Music Player').closest('a')
        expect(musicLink).toHaveAttribute('data-active', 'true')
        expect(musicLink).toHaveAttribute('aria-current', 'page')
    })

    test('hides Guild Automation nav item without settings manage access', () => {
        mockGuildStoreState({
            memberContext: {
                guildId: mockGuild.id,
                nickname: null,
                username: 'TestUser',
                globalName: null,
                roleIds: [],
                effectiveAccess: {
                    ...ACCESS_NONE,
                    overview: 'view',
                    settings: 'view',
                    automation: 'manage',
                },
                canManageRbac: false,
            },
        })

        renderSidebar()

        expect(screen.queryByText('Guild Automation')).not.toBeInTheDocument()
    })

    test('shows Guild Automation nav item with settings manage access', () => {
        mockGuildStoreState({
            memberContext: {
                guildId: mockGuild.id,
                nickname: null,
                username: 'TestUser',
                globalName: null,
                roleIds: [],
                effectiveAccess: {
                    ...ACCESS_NONE,
                    overview: 'view',
                    settings: 'manage',
                },
                canManageRbac: true,
            },
        })

        renderSidebar()

        expect(screen.getByText('Guild Automation')).toBeInTheDocument()
    })

    test('opens and closes mobile sidebar', async () => {
        const user = userEvent.setup()
        renderSidebar()

        const openButton = screen.getByRole('button', {
            name: /open navigation menu/i,
        })
        expect(openButton).toBeTruthy()

        await user.click(openButton)

        // Check that mobile sidebar appears
        const mobileSidebar = document.getElementById('mobile-sidebar')
        expect(mobileSidebar).toBeTruthy()

        // Find and click overlay to close
        const overlay = document.querySelector('div[aria-hidden="true"].fixed')
        if (overlay) {
            await user.click(overlay as HTMLElement)
        }

        await waitFor(() => {
            const closedSidebar = document.getElementById('mobile-sidebar')
            expect(closedSidebar).not.toBeInTheDocument()
        })
    })
})
