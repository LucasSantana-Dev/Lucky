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
        vi.mocked(useGuildStore).mockReturnValue({
            guilds: [mockGuild, mockGuild2],
            selectedGuild: mockGuild,
            selectedGuildId: mockGuild.id,
            isLoading: false,
            serverSettings: null,
            serverListing: null,
            fetchGuilds: vi.fn(),
            selectGuild: mockSelectGuild,
            setSelectedGuild: vi.fn(),
            updateServerSettings: vi.fn(),
            updateServerListing: vi.fn(),
        })
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
        vi.mocked(useGuildStore).mockReturnValue({
            guilds: [mockGuild],
            selectedGuild: null,
            selectedGuildId: null,
            isLoading: false,
            serverSettings: null,
            serverListing: null,
            fetchGuilds: vi.fn(),
            selectGuild: mockSelectGuild,
            setSelectedGuild: vi.fn(),
            updateServerSettings: vi.fn(),
            updateServerListing: vi.fn(),
        })

        renderSidebar()

        expect(screen.getByText('Select a server')).toBeInTheDocument()
    })

    test('shows authorized guilds even when bot is not added', async () => {
        const guildWithoutBot: Guild = {
            ...mockGuild2,
            botAdded: false,
        }

        vi.mocked(useGuildStore).mockReturnValue({
            guilds: [mockGuild, guildWithoutBot],
            selectedGuild: mockGuild,
            selectedGuildId: mockGuild.id,
            isLoading: false,
            serverSettings: null,
            serverListing: null,
            fetchGuilds: vi.fn(),
            selectGuild: mockSelectGuild,
            setSelectedGuild: vi.fn(),
            updateServerSettings: vi.fn(),
            updateServerListing: vi.fn(),
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

        vi.mocked(useGuildStore).mockReturnValue({
            guilds: noBotGuilds,
            selectedGuild: null,
            selectedGuildId: null,
            isLoading: false,
            serverSettings: null,
            serverListing: null,
            fetchGuilds: vi.fn(),
            selectGuild: mockSelectGuild,
            setSelectedGuild: vi.fn(),
            updateServerSettings: vi.fn(),
            updateServerListing: vi.fn(),
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
        vi.mocked(useGuildStore).mockReturnValue({
            guilds: [],
            selectedGuild: null,
            selectedGuildId: null,
            isLoading: false,
            serverSettings: null,
            serverListing: null,
            fetchGuilds: vi.fn(),
            selectGuild: mockSelectGuild,
            setSelectedGuild: vi.fn(),
            updateServerSettings: vi.fn(),
            updateServerListing: vi.fn(),
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
