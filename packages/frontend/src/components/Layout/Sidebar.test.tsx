import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ADMIN_PATHS } from './navConfig'
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

    test('links to config and batch jobs for everyone', () => {
        renderSidebar()

        expect(
            screen.getByRole('link', { name: 'Configuration' }),
        ).toHaveAttribute('href', '/config')
        expect(
            screen.getByRole('link', { name: 'Batch Jobs' }),
        ).toHaveAttribute('href', '/batch-jobs')
    })

    test('ADMIN_PATHS covers the admin sidebar links', () => {
        expect(ADMIN_PATHS).toEqual(['/admin', '/admin/support'])
    })

    test('hides the admin support link from non-developers', () => {
        renderSidebar()

        expect(
            screen.queryByRole('link', { name: 'Support Reports' }),
        ).not.toBeInTheDocument()
    })

    test('shows the admin support link to developers', () => {
        vi.mocked(useAuthStore).mockReturnValue({
            user: mockUser,
            isAuthenticated: true,
            isLoading: false,
            isDeveloper: true,
            login: vi.fn(),
            logout: mockLogout,
            checkAuth: vi.fn(),
            checkDeveloperStatus: vi.fn(),
        })
        renderSidebar()

        expect(
            screen.getByRole('link', { name: 'Support Reports' }),
        ).toHaveAttribute('href', '/admin/support')
    })

    test('highlights only the support link on /admin/support', () => {
        vi.mocked(useAuthStore).mockReturnValue({
            user: mockUser,
            isAuthenticated: true,
            isLoading: false,
            isDeveloper: true,
            login: vi.fn(),
            logout: mockLogout,
            checkAuth: vi.fn(),
            checkDeveloperStatus: vi.fn(),
        })
        renderSidebar('/admin/support')

        expect(
            screen.getByRole('link', { name: 'Support Reports' }),
        ).toHaveAttribute('data-active', 'true')
        expect(
            screen.getByRole('link', { name: 'Admin Panel' }),
        ).toHaveAttribute('data-active', 'false')
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

    test('activates the exact-match child route, not its parent, on /music/history', () => {
        renderSidebar('/music/history')

        const musicLink = screen.getByText('Music Player').closest('a')
        const historyLink = screen.getByText('Track History').closest('a')
        expect(musicLink).toHaveAttribute('data-active', 'false')
        expect(musicLink).not.toHaveAttribute('aria-current')
        expect(historyLink).toHaveAttribute('data-active', 'true')
        expect(historyLink).toHaveAttribute('aria-current', 'page')
    })

    test('activates only Music Player on /music', () => {
        renderSidebar('/music')

        const musicLink = screen.getByText('Music Player').closest('a')
        const historyLink = screen.getByText('Track History').closest('a')
        const artistsLink = screen.getByText('Musical Taste').closest('a')
        expect(musicLink).toHaveAttribute('data-active', 'true')
        expect(historyLink).toHaveAttribute('data-active', 'false')
        expect(artistsLink).toHaveAttribute('data-active', 'false')
    })

    test('activates only Musical Taste on /music/artists', () => {
        renderSidebar('/music/artists')

        const musicLink = screen.getByText('Music Player').closest('a')
        const artistsLink = screen.getByText('Musical Taste').closest('a')
        expect(musicLink).toHaveAttribute('data-active', 'false')
        expect(artistsLink).toHaveAttribute('data-active', 'true')
        expect(artistsLink).toHaveAttribute('aria-current', 'page')
    })

    test('activates a non-music parent route via prefix on a nested sub-route (/settings/advanced)', () => {
        renderSidebar('/settings/advanced')

        const settingsLink = screen.getByText('Server Settings').closest('a')
        const dashboardLink = screen.getByText('Dashboard').closest('a')
        expect(settingsLink).toHaveAttribute('data-active', 'true')
        expect(settingsLink).toHaveAttribute('aria-current', 'page')
        expect(dashboardLink).toHaveAttribute('data-active', 'false')
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

        const mobileSidebar = document.getElementById('mobile-sidebar')
        expect(mobileSidebar).toBeTruthy()

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
