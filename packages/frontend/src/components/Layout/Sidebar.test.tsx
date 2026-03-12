import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuthStore } from '@/stores/authStore'
import { useGuildStore } from '@/stores/guildStore'
import type { User, Guild } from '@/types'

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

describe('Sidebar', () => {
    const mockLogout = vi.fn()
    const mockSelectGuild = vi.fn()
    const mockFetchGuilds = vi.fn()
    const mockSetSelectedGuild = vi.fn()
    const mockUpdateServerSettings = vi.fn()
    const mockUpdateServerListing = vi.fn()

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
            serverListing: null,
            fetchGuilds: mockFetchGuilds,
            selectGuild: mockSelectGuild,
            fetchMemberContext: vi.fn(),
            setSelectedGuild: mockSetSelectedGuild,
            getSelectedGuild: vi.fn(),
            updateServerSettings: mockUpdateServerSettings,
            updateServerListing: mockUpdateServerListing,
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

        expect(featuresLink).toHaveAttribute('data-active', 'true')
        expect(dashboardLink).toHaveAttribute('data-active', 'false')
    })

    test('shows server selector dropdown with guilds', async () => {
        const user = userEvent.setup()
        renderSidebar()

        expect(screen.getByText('Test Server')).toBeInTheDocument()

        const dropdownButton = screen.getByRole('button', {
            name: /test server/i,
        })
        await user.click(dropdownButton)

        await waitFor(() => {
            expect(screen.getByText('Another Server')).toBeInTheDocument()
        })
    })

    test('selects guild from dropdown', async () => {
        const user = userEvent.setup()
        renderSidebar()

        const dropdownButton = screen.getByText('Test Server').closest('button')
        await user.click(dropdownButton!)

        await waitFor(() => {
            expect(screen.getByText('Another Server')).toBeInTheDocument()
        })

        const anotherServerButton = screen.getByText('Another Server')
        await user.click(anotherServerButton)

        expect(mockSelectGuild).toHaveBeenCalledWith(mockGuild2)
    })

    test('shows user profile information', () => {
        renderSidebar()

        expect(screen.getByText('TestUser')).toBeInTheDocument()
        expect(screen.getByText('@TestUser')).toBeInTheDocument()
    })

    test('calls logout when logout button clicked', async () => {
        const user = userEvent.setup()
        renderSidebar()

        const logoutButton = screen.getByRole('button', { name: /logout/i })
        await user.click(logoutButton)

        expect(mockLogout).toHaveBeenCalledTimes(1)
    })

    test('shows "Select a server" when no guild selected', () => {
        mockGuildStoreState({
            guilds: [mockGuild],
            selectedGuild: null,
            selectedGuildId: null,
        })

        renderSidebar()

        expect(screen.getByText('Select a server')).toBeInTheDocument()
    })

    test('shows authorized guilds even when bot is not added', async () => {
        const guildWithoutBot: Guild = {
            ...mockGuild2,
            botAdded: false,
        }

        mockGuildStoreState({
            guilds: [mockGuild, guildWithoutBot],
            selectedGuild: mockGuild,
            selectedGuildId: mockGuild.id,
        })

        const user = userEvent.setup()
        renderSidebar()

        const dropdownButton = screen.getByText('Test Server').closest('button')
        await user.click(dropdownButton!)

        await waitFor(() => {
            expect(screen.getByText('Another Server')).toBeInTheDocument()
            expect(screen.getByText('Invite bot')).toBeInTheDocument()
        })
    })

    test('shows invite badges when all accessible guilds are missing bot', async () => {
        const noBotGuilds: Guild[] = [
            { ...mockGuild, botAdded: false },
            { ...mockGuild2, botAdded: false },
        ]

        mockGuildStoreState({
            guilds: noBotGuilds,
            selectedGuild: null,
            selectedGuildId: null,
        })

        const user = userEvent.setup()
        renderSidebar()

        await user.click(
            screen.getByRole('button', { name: /select a server/i }),
        )

        await waitFor(() => {
            expect(screen.getByText('Test Server')).toBeInTheDocument()
            expect(screen.getByText('Another Server')).toBeInTheDocument()
            expect(screen.getAllByText('Invite bot')).toHaveLength(2)
        })
    })

    test('shows no-admin state when user has no guilds', async () => {
        mockGuildStoreState({
            guilds: [],
            selectedGuild: null,
            selectedGuildId: null,
            guildLoadError: null,
        })

        const user = userEvent.setup()
        renderSidebar()

        await user.click(
            screen.getByRole('button', { name: /select a server/i }),
        )

        await waitFor(() => {
            expect(
                screen.getByText('No accessible servers found'),
            ).toBeInTheDocument()
            expect(
                screen.queryByText(
                    'Invite Lucky to one of your servers from the Dashboard.',
                ),
            ).not.toBeInTheDocument()
        })
    })

    test('shows retry and re-auth CTAs when guild fetch fails from auth state', async () => {
        const user = userEvent.setup()
        mockGuildStoreState({
            guilds: [],
            selectedGuild: null,
            selectedGuildId: null,
            guildLoadError: {
                kind: 'auth',
                status: 401,
                message: 'Session expired',
            },
        } as Partial<ReturnType<typeof useGuildStore>>)

        renderSidebar()

        await user.click(
            screen.getByRole('button', { name: /select a server/i }),
        )

        await waitFor(() => {
            expect(screen.getByText('Could not load servers')).toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
            expect(
                screen.getByRole('link', { name: 'Re-authenticate' }),
            ).toBeInTheDocument()
        })

        await user.click(screen.getByRole('button', { name: 'Retry' }))
        expect(mockFetchGuilds).toHaveBeenCalledTimes(1)
    })

    test('shows re-auth CTA when guild fetch fails from forbidden state', async () => {
        const user = userEvent.setup()
        mockGuildStoreState({
            guilds: [],
            selectedGuild: null,
            selectedGuildId: null,
            guildLoadError: {
                kind: 'forbidden',
                status: 403,
                message: 'Missing oauth scope',
            },
        } as Partial<ReturnType<typeof useGuildStore>>)

        renderSidebar()

        await user.click(
            screen.getByRole('button', { name: /select a server/i }),
        )

        await waitFor(() => {
            expect(
                screen.getByText('Discord access is missing required scope.'),
            ).toBeInTheDocument()
            expect(
                screen.getByRole('link', { name: 'Re-authenticate' }),
            ).toBeInTheDocument()
        })
    })

    test('shows network guidance without re-auth CTA on network failures', async () => {
        const user = userEvent.setup()
        mockGuildStoreState({
            guilds: [],
            selectedGuild: null,
            selectedGuildId: null,
            guildLoadError: {
                kind: 'network',
                status: 0,
                message: 'Network down',
            },
        } as Partial<ReturnType<typeof useGuildStore>>)

        renderSidebar()

        await user.click(
            screen.getByRole('button', { name: /select a server/i }),
        )

        await waitFor(() => {
            expect(
                screen.getByText(
                    'Network connection failed. Check connectivity and retry.',
                ),
            ).toBeInTheDocument()
            expect(
                screen.queryByRole('link', { name: 'Re-authenticate' }),
            ).not.toBeInTheDocument()
        })
    })

    test('opens and closes mobile sidebar', async () => {
        const user = userEvent.setup()
        renderSidebar()

        expect(
            screen.getAllByRole('button', { name: /close sidebar/i }),
        ).toHaveLength(1)

        const openButton = screen.getByRole('button', { name: /open sidebar/i })
        await user.click(openButton)

        await waitFor(() => {
            expect(
                screen.getAllByRole('button', { name: /close sidebar/i }),
            ).toHaveLength(2)
        })

        const mobileSidebar = document.querySelector(
            'aside.fixed.inset-y-0.left-0.z-50.w-72.bg-lucky-bg-secondary.lg\\:hidden',
        )
        expect(mobileSidebar).toBeTruthy()

        const mobileCloseButton = within(
            mobileSidebar as HTMLElement,
        ).getByRole('button', {
            name: /close sidebar/i,
        })
        await user.click(mobileCloseButton)

        await waitFor(() => {
            if (mobileSidebar && document.body.contains(mobileSidebar)) {
                expect(mobileSidebar).toHaveStyle({
                    transform: 'translateX(-100%)',
                })
                return
            }

            expect(mobileSidebar).not.toBeInTheDocument()
        })
    })
})
