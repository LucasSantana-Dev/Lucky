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
})
