import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ServersPage from './ServersPage'
import { useGuildStore } from '@/stores/guildStore'
import { useAuthStore } from '@/stores/authStore'

vi.mock('@/stores/guildStore')
vi.mock('@/stores/authStore')
vi.mock('@/hooks/usePageMetadata', () => ({ usePageMetadata: vi.fn() }))
vi.mock('@/components/Dashboard/ServerGrid', () => ({
    default: () => <div data-testid='server-grid'>ServerGrid</div>,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/services/api', () => ({
    api: { guilds: { getInvite: vi.fn() } },
}))

const translations: Record<string, string> = {
    discordAccount: 'Discord Account',
    totalServers: 'Total Servers',
    serversLabel: 'Servers',
    yourServers: 'Your Servers',
    serversWithBot: '{{count}} servers — {{count2}} with Lucky installed',
    navServers: 'Servers',
    navPremium: 'Premium',
    navSettings: 'Settings',
    recentlyActive: 'Recently Active',
    allOtherServers: 'All Other Servers',
    luckyInstalled: 'Lucky installed',
    inviteLucky: 'Invite Lucky',
    noServersTitle: 'No servers yet',
    noServersDescription: 'Join a Discord server and Lucky will appear here.',
}

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, any>) => {
            if (options) {
                let result = translations[key] || key
                Object.entries(options).forEach(([k, v]) => {
                    result = result.replace(`{{${k}}}`, String(v))
                })
                return result
            }
            return translations[key] || key
        },
        i18n: { language: 'en' },
    }),
}))

const mockUser = { username: 'TestUser', avatar: null }
const mockGuilds = [
    { id: '1', name: 'Server 1' },
    { id: '2', name: 'Server 2' },
]

function mockStores({
    isLoading = false,
    guilds = mockGuilds,
    user = mockUser,
    selectGuild = vi.fn(),
}: any = {}) {
    vi.mocked(useGuildStore).mockImplementation((selector?: any) => {
        const state = {
            guilds,
            selectedGuild: null,
            selectGuild,
            isLoading,
            error: null,
            fetchGuilds: vi.fn(),
        }
        return typeof selector === 'function' ? selector(state) : state
    })
    vi.mocked(useAuthStore).mockImplementation((selector?: any) => {
        const state = {
            user,
            isAuthenticated: true,
            login: vi.fn(),
            logout: vi.fn(),
        }
        return typeof selector === 'function' ? selector(state) : state
    })
}

describe('ServersPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows loading skeletons when loading', () => {
        mockStores({ isLoading: true })
        render(
            <MemoryRouter>
                <ServersPage />
            </MemoryRouter>,
        )
        const skeletons = document.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    test('renders user info', () => {
        mockStores()
        render(
            <MemoryRouter>
                <ServersPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('TestUser')).toBeInTheDocument()
        expect(screen.getByText('@TestUser')).toBeInTheDocument()
    })

    test('renders navigation tabs', () => {
        mockStores()
        render(
            <MemoryRouter>
                <ServersPage />
            </MemoryRouter>,
        )
        expect(screen.getAllByText('Servers').length).toBeGreaterThanOrEqual(2)
        expect(screen.getByText('Premium')).toBeInTheDocument()
        expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    test('shows server count summary', () => {
        mockStores()
        render(
            <MemoryRouter>
                <ServersPage />
            </MemoryRouter>,
        )
        expect(
            screen.getByText('2 servers — 0 with Lucky installed'),
        ).toBeInTheDocument()
    })

    test('renders server grid', () => {
        mockStores()
        render(
            <MemoryRouter>
                <ServersPage />
            </MemoryRouter>,
        )
        expect(screen.getByTestId('server-grid')).toBeInTheDocument()
    })

    test('shows user avatar fallback', () => {
        mockStores()
        render(
            <MemoryRouter>
                <ServersPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('TE')).toBeInTheDocument()
    })

    test('shows empty state when no guilds', () => {
        mockStores({ guilds: [] })
        render(
            <MemoryRouter>
                <ServersPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('No servers yet')).toBeInTheDocument()
    })

    test('shows Lucky installed badge when botAdded is true', () => {
        mockStores({ guilds: [{ id: '1', name: 'Server 1', botAdded: true }] })
        render(
            <MemoryRouter>
                <ServersPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('Lucky installed')).toBeInTheDocument()
    })

    function renderAtServers() {
        return render(
            <MemoryRouter initialEntries={['/servers']}>
                <Routes>
                    <Route path='/servers' element={<ServersPage />} />
                    <Route
                        path='/'
                        element={<div data-testid='home-page'>Home</div>}
                    />
                    <Route
                        path='*'
                        element={<div data-testid='not-found'>Not Found</div>}
                    />
                </Routes>
            </MemoryRouter>,
        )
    }

    test('recently active card navigates to a route that exists when bot is installed', async () => {
        const selectGuild = vi.fn()
        const guild = { id: '1', name: 'Server 1', botAdded: true }
        mockStores({ guilds: [guild], selectGuild })
        const user = userEvent.setup()
        renderAtServers()

        const card = screen.getByText('Server 1').closest('button')
        expect(card).not.toBeNull()
        await user.click(card as HTMLButtonElement)

        expect(selectGuild).toHaveBeenCalledWith(
            expect.objectContaining({ id: '1' }),
        )
        expect(screen.getByTestId('home-page')).toBeInTheDocument()
        expect(screen.queryByTestId('not-found')).not.toBeInTheDocument()
    })

    test('recently active card opens invite flow instead of navigating when bot is not installed', async () => {
        const { api } = await import('@/services/api')
        vi.mocked(api.guilds.getInvite).mockResolvedValue({
            data: { inviteUrl: 'https://discord.com/invite/test' },
        } as any)
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
        const selectGuild = vi.fn()
        const guild = { id: '1', name: 'Server 1', botAdded: false }
        mockStores({ guilds: [guild], selectGuild })
        const user = userEvent.setup()
        renderAtServers()

        const card = screen.getByText('Server 1').closest('button')
        await user.click(card as HTMLButtonElement)

        expect(api.guilds.getInvite).toHaveBeenCalledWith('1')
        expect(openSpy).toHaveBeenCalledWith(
            'https://discord.com/invite/test',
            '_blank',
        )
        expect(selectGuild).not.toHaveBeenCalled()
        expect(screen.queryByTestId('home-page')).not.toBeInTheDocument()
        openSpy.mockRestore()
    })
})
