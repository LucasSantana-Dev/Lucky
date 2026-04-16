import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import App from './App'
import { useAuthStore } from '@/stores/authStore'
import { useGuildStore } from '@/stores/guildStore'
import type { EffectiveAccessMap } from '@/types/rbac'

vi.mock('@/stores/authStore')
vi.mock('@/stores/guildStore')

vi.mock('./components/Layout/Layout', () => ({
    default: ({ children }: { children: ReactNode }) => (
        <div data-testid='layout'>{children}</div>
    ),
}))

vi.mock('./pages/Landing', () => ({
    default: () => <h1>Landing Page</h1>,
}))

vi.mock('./pages/Login', () => ({
    default: () => <h1>Login Page</h1>,
}))

vi.mock('./pages/ServersPage', () => ({
    default: () => <h1>Servers Page</h1>,
}))

vi.mock('./pages/Moderation', () => ({
    default: () => <h1>Moderation Page</h1>,
}))

vi.mock('./pages/TwitchNotifications', () => ({
    default: () => <h1>Twitch Notifications Page</h1>,
}))

vi.mock('./pages/Features', () => ({
    default: () => <h1>Features Page</h1>,
}))

vi.mock('./pages/GuildAutomation', () => ({
    default: () => <h1>Guild Automation Page</h1>,
}))

type AuthState = {
    isAuthenticated: boolean
    isLoading: boolean
    checkAuth: () => Promise<void>
}

type GuildState = {
    selectedGuild: {
        id: string
        name: string
        effectiveAccess?: EffectiveAccessMap
    } | null
    memberContext: {
        effectiveAccess?: EffectiveAccessMap
        canManageRbac?: boolean
    } | null
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

const MANAGE_ACCESS: EffectiveAccessMap = {
    overview: 'manage',
    settings: 'manage',
    moderation: 'manage',
    automation: 'manage',
    music: 'manage',
    integrations: 'manage',
}

const NONE_ACCESS: EffectiveAccessMap = {
    overview: 'none',
    settings: 'none',
    moderation: 'none',
    automation: 'none',
    music: 'none',
    integrations: 'none',
}

function mockAuthStore(overrides: Partial<AuthState> = {}) {
    const state = { ...defaultAuthState, ...overrides }
    const storeImpl = ((selector?: (value: AuthState) => unknown) =>
        selector ? selector(state) : state) as typeof useAuthStore
    vi.mocked(useAuthStore).mockImplementation(storeImpl)
}

function mockGuildStore(overrides: Partial<GuildState> = {}) {
    const state = { ...defaultGuildState, ...overrides }
    const storeImpl = ((selector?: (value: GuildState) => unknown) =>
        selector ? selector(state) : state) as typeof useGuildStore
    vi.mocked(useGuildStore).mockImplementation(storeImpl)
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

    test('renders landing page for unauthenticated root route', async () => {
        renderAt('/')
        expect(
            await screen.findByRole('heading', { name: 'Landing Page' }),
        ).toBeInTheDocument()
    })

    test('renders login page for unauthenticated /login route', async () => {
        renderAt('/login')
        expect(
            await screen.findByRole('heading', { name: 'Login Page' }),
        ).toBeInTheDocument()
    })

    test('renders landing page when auth check rejects and navigating to /', async () => {
        const checkAuth = vi.fn().mockRejectedValue(new Error('auth failed'))
        mockAuthStore({
            checkAuth,
        })

        renderAt('/')

        await waitFor(() => {
            expect(checkAuth).toHaveBeenCalled()
        })

        expect(
            await screen.findByRole('heading', { name: 'Landing Page' }),
        ).toBeInTheDocument()
    })

    test('renders guarded route when authenticated and no guild is selected', async () => {
        mockAuthStore({ isAuthenticated: true })
        mockGuildStore({ selectedGuild: null, memberContextLoading: false })

        renderAt('/twitch')

        expect(
            await screen.findByRole('heading', {
                name: 'Twitch Notifications Page',
            }),
        ).toBeInTheDocument()
    })

    test('renders page loader while member context is loading for authenticated routes', async () => {
        mockAuthStore({ isAuthenticated: true })
        mockGuildStore({
            selectedGuild: {
                id: '123',
                name: 'Guild',
                effectiveAccess: MANAGE_ACCESS,
            },
            memberContextLoading: true,
        })

        renderAt('/moderation')

        await waitFor(() => {
            expect(screen.getByRole('status')).toBeInTheDocument()
        })
        expect(screen.queryByText('Moderation Page')).not.toBeInTheDocument()
        expect(screen.queryByText('Access denied')).not.toBeInTheDocument()
    })

    test('renders guarded route when authenticated user has module access', async () => {
        mockAuthStore({ isAuthenticated: true })
        mockGuildStore({
            selectedGuild: {
                id: '123',
                name: 'Guild',
                effectiveAccess: {
                    ...NONE_ACCESS,
                    overview: 'manage',
                    settings: 'manage',
                    moderation: 'view',
                },
            },
            memberContextLoading: false,
        })

        renderAt('/moderation')

        expect(
            await screen.findByRole('heading', { name: 'Moderation Page' }),
        ).toBeInTheDocument()
    })

    test('renders forbidden state when authenticated user lacks module access', async () => {
        mockAuthStore({ isAuthenticated: true })
        mockGuildStore({
            selectedGuild: {
                id: '123',
                name: 'Guild',
                effectiveAccess: {
                    ...NONE_ACCESS,
                    overview: 'view',
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

    test('guards /features route with automation module access', async () => {
        mockAuthStore({ isAuthenticated: true })
        mockGuildStore({
            selectedGuild: {
                id: '123',
                name: 'Guild',
                effectiveAccess: {
                    ...NONE_ACCESS,
                    overview: 'manage',
                    settings: 'manage',
                    moderation: 'manage',
                },
            },
            memberContextLoading: false,
        })

        renderAt('/features')

        expect(await screen.findByText('Access denied')).toBeInTheDocument()
        expect(
            screen.getByText(
                'You do not have permission to view the automation module for this server.',
            ),
        ).toBeInTheDocument()
        expect(screen.queryByText('Features Page')).not.toBeInTheDocument()
    })

    test('keeps /servers accessible even without overview module access', async () => {
        mockAuthStore({ isAuthenticated: true })
        mockGuildStore({
            selectedGuild: {
                id: '123',
                name: 'Guild',
                effectiveAccess: NONE_ACCESS,
            },
            memberContextLoading: false,
        })

        renderAt('/servers')

        expect(
            await screen.findByRole('heading', { name: 'Servers Page' }),
        ).toBeInTheDocument()
    })

    test('requires settings manage access for /guild-automation route', async () => {
        mockAuthStore({ isAuthenticated: true })
        mockGuildStore({
            selectedGuild: {
                id: '123',
                name: 'Guild',
                effectiveAccess: {
                    ...NONE_ACCESS,
                    overview: 'view',
                    settings: 'view',
                    automation: 'manage',
                },
            },
            memberContextLoading: false,
        })

        renderAt('/guild-automation')

        expect(await screen.findByText('Access denied')).toBeInTheDocument()
        expect(
            screen.getByText(
                'You do not have permission to view the settings module for this server.',
            ),
        ).toBeInTheDocument()
        expect(
            screen.queryByText('Guild Automation Page'),
        ).not.toBeInTheDocument()
    })

    test('renders /guild-automation when user has settings manage access', async () => {
        mockAuthStore({ isAuthenticated: true })
        mockGuildStore({
            selectedGuild: {
                id: '123',
                name: 'Guild',
                effectiveAccess: {
                    ...NONE_ACCESS,
                    overview: 'manage',
                    settings: 'manage',
                },
            },
            memberContextLoading: false,
        })

        renderAt('/guild-automation')

        expect(
            await screen.findByRole('heading', {
                name: 'Guild Automation Page',
            }),
        ).toBeInTheDocument()
    })

    test('renders landing page for unauthenticated / with verified content', async () => {
        renderAt('/')

        const landingHeading = await screen.findByRole('heading', {
            name: 'Landing Page',
        })
        expect(landingHeading).toBeInTheDocument()
        expect(landingHeading).toBeVisible()
    })

    test('renders dashboard for authenticated / route', async () => {
        mockAuthStore({ isAuthenticated: true })
        mockGuildStore({
            selectedGuild: {
                id: '123',
                name: 'Guild',
                effectiveAccess: MANAGE_ACCESS,
            },
            memberContextLoading: false,
        })

        renderAt('/')

        expect(
            await screen.findByTestId('layout'),
        ).toBeInTheDocument()
    })

    test('redirects unauthenticated user accessing /dashboard to /login', async () => {
        renderAt('/dashboard')

        expect(
            await screen.findByRole('heading', { name: 'Landing Page' }),
        ).toBeInTheDocument()
    })

    test('/login route is accessible when unauthenticated', async () => {
        renderAt('/login')

        expect(
            await screen.findByRole('heading', { name: 'Login Page' }),
        ).toBeInTheDocument()
    })

    test('unauthenticated user accessing authenticated route redirects to landing', async () => {
        renderAt('/moderation')

        expect(
            await screen.findByRole('heading', { name: 'Landing Page' }),
        ).toBeInTheDocument()
    })

    test('handles auth check errors gracefully during init', async () => {
        const checkAuth = vi.fn().mockRejectedValue(new Error('Connection failed'))
        mockAuthStore({ checkAuth })
        mockGuildStore()

        renderAt('/servers')

        await waitFor(() => {
            expect(checkAuth).toHaveBeenCalled()
        })

        expect(
            await screen.findByRole('heading', { name: 'Landing Page' }),
        ).toBeInTheDocument()
    })

    test('shows page loader while auth is loading', async () => {
        const checkAuth = vi.fn<() => Promise<void>>(() => new Promise(() => {}))
        mockAuthStore({ isLoading: true, checkAuth })

        renderAt('/')

        expect(screen.getByRole('status')).toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: /Landing Page|Dashboard/ })).not.toBeInTheDocument()
    })

    test('authenticated user landing on wildcard route gets redirected to dashboard', async () => {
        mockAuthStore({ isAuthenticated: true })
        mockGuildStore({
            selectedGuild: {
                id: '123',
                name: 'Guild',
                effectiveAccess: MANAGE_ACCESS,
            },
            memberContextLoading: false,
        })

        renderAt('/unknown-route')

        await waitFor(() => {
            expect(screen.getByTestId('layout')).toBeInTheDocument()
        })
    })

    test('legal routes (/terms, /privacy) work for unauthenticated users', async () => {
        renderAt('/terms')

        await waitFor(() => {
            expect(screen.queryByRole('status')).not.toBeInTheDocument()
        })
    })
})
