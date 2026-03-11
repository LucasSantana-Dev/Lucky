import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import App from './App'
import { useAuthStore } from '@/stores/authStore'
import { useGuildStore } from '@/stores/guildStore'

vi.mock('@/stores/authStore')
vi.mock('@/stores/guildStore')

vi.mock('./components/Layout/Layout', () => ({
    default: ({ children }: { children: ReactNode }) => (
        <div data-testid='layout'>{children}</div>
    ),
}))

vi.mock('./pages/Login', () => ({
    default: () => <h1>Login Page</h1>,
}))

vi.mock('./pages/Moderation', () => ({
    default: () => <h1>Moderation Page</h1>,
}))

type AuthState = {
    isAuthenticated: boolean
    isLoading: boolean
    checkAuth: () => Promise<void>
}

type GuildState = {
    selectedGuild: { id: string; name: string; effectiveAccess?: any } | null
    memberContext: { effectiveAccess?: any; canManageRbac?: boolean } | null
    memberContextLoading: boolean
}

const defaultAuthState: AuthState = {
    isAuthenticated: false,
    isLoading: false,
    checkAuth: async () => {},
}

const defaultGuildState: GuildState = {
    selectedGuild: null,
    memberContext: null,
    memberContextLoading: false,
}

function mockAuthStore(overrides: Partial<AuthState> = {}) {
    const state = { ...defaultAuthState, ...overrides }
    vi.mocked(useAuthStore).mockImplementation((selector) =>
        selector ? selector(state as any) : (state as any),
    )
}

function mockGuildStore(overrides: Partial<GuildState> = {}) {
    const state = { ...defaultGuildState, ...overrides }
    vi.mocked(useGuildStore).mockImplementation(() => state as any)
}

function renderAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <App />
        </MemoryRouter>,
    )
}

describe('App authenticated routing', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockAuthStore()
        mockGuildStore()
    })

    test('renders login page for unauthenticated non-legal routes', async () => {
        renderAt('/unknown')
        expect(
            await screen.findByRole('heading', { name: 'Login Page' }),
        ).toBeInTheDocument()
    })

    test('renders page loader while member context is loading for authenticated routes', async () => {
        mockAuthStore({ isAuthenticated: true })
        mockGuildStore({
            selectedGuild: {
                id: '123',
                name: 'Guild',
                effectiveAccess: {
                    overview: 'manage',
                    settings: 'manage',
                    moderation: 'manage',
                    automation: 'manage',
                    music: 'manage',
                    integrations: 'manage',
                },
            },
            memberContextLoading: true,
        })

        renderAt('/moderation')

        await waitFor(() => {
            expect(document.querySelector('.animate-spin')).not.toBeNull()
        })
        expect(screen.queryByText('Moderation Page')).not.toBeInTheDocument()
        expect(screen.queryByText('Access denied')).not.toBeInTheDocument()
    })

    test('renders forbidden state when authenticated user lacks module access', async () => {
        mockAuthStore({ isAuthenticated: true })
        mockGuildStore({
            selectedGuild: {
                id: '123',
                name: 'Guild',
                effectiveAccess: {
                    overview: 'view',
                    settings: 'none',
                    moderation: 'none',
                    automation: 'none',
                    music: 'none',
                    integrations: 'none',
                },
            },
            memberContextLoading: false,
        })

        renderAt('/moderation')

        expect(await screen.findByText('Access denied')).toBeInTheDocument()
        expect(
            screen.getByText(
                'You do not have permission to view the moderation module for this server.',
            ),
        ).toBeInTheDocument()
    })
})
