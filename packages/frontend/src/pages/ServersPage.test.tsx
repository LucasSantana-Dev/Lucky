import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ServersPage from './ServersPage'
import { useGuildStore } from '@/stores/guildStore'
import { useAuthStore } from '@/stores/authStore'

vi.mock('@/stores/guildStore')
vi.mock('@/stores/authStore')
vi.mock('@/hooks/usePageMetadata', () => ({ usePageMetadata: vi.fn() }))
vi.mock('@/components/Dashboard/ServerGrid', () => ({
    default: () => <div data-testid='server-grid'>ServerGrid</div>,
}))

// Translation key to English value mapping
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
                // Handle interpolation like {{count}} and {{count2}}
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
}: any = {}) {
    vi.mocked(useGuildStore).mockImplementation((selector?: any) => {
        const state = {
            guilds,
            selectedGuild: null,
            selectGuild: vi.fn(),
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
})
