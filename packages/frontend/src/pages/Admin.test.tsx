import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AdminPage from './Admin'
import { useAuthStore } from '@/stores/authStore'
import { useFeatures } from '@/hooks/useFeatures'
import type { FeatureToggleState } from '@/types'

vi.mock('@/stores/authStore')
vi.mock('@/hooks/useFeatures')
vi.mock('@/hooks/usePageMetadata', () => ({ usePageMetadata: vi.fn() }))
vi.mock('@/components/Features/GlobalTogglesSection', () => ({
    default: () => <div data-testid='global-toggles' />,
}))
vi.mock('@/components/Admin/BotGuildsSection', () => ({
    default: () => <div data-testid='bot-guilds' />,
}))
vi.mock('@/services/api', () => ({
    api: { auth: { getDiscordLoginUrl: vi.fn(() => '/api/auth/discord') } },
}))

function mockAuthStore(overrides: Record<string, unknown> = {}) {
    vi.mocked(useAuthStore).mockImplementation((selector?: unknown) => {
        const state = {
            isDeveloper: false,
            isAuthenticated: false,
            login: vi.fn(),
            ...overrides,
        }
        return typeof selector === 'function' ? selector(state) : state
    })
}

function mockFeatures(overrides: Record<string, unknown> = {}) {
    vi.mocked(useFeatures).mockReturnValue({
        globalToggles: {} as unknown as FeatureToggleState,
        globalToggleProvider: 'environment',
        globalTogglesWritable: false,
        isLoading: false,
        loadError: null,
        retryLoad: vi.fn(),
        handleGlobalToggle: vi.fn(),
        ...overrides,
    } as unknown as ReturnType<typeof useFeatures>)
}

describe('AdminPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows sign-in prompt when not authenticated', () => {
        mockAuthStore({ isAuthenticated: false })
        mockFeatures()
        render(
            <MemoryRouter>
                <AdminPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('Admin Panel')).toBeInTheDocument()
        expect(
            screen.getByText('Sign in with Discord to access the admin panel.'),
        ).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Sign in with Discord' }),
        ).toBeInTheDocument()
    })

    test('triggers login action when sign-in button clicked', async () => {
        const user = userEvent.setup()
        const login = vi.fn()
        mockAuthStore({ isAuthenticated: false, login })
        mockFeatures()
        render(
            <MemoryRouter>
                <AdminPage />
            </MemoryRouter>,
        )
        await user.click(screen.getByRole('button', { name: 'Sign in with Discord' }))
        expect(login).toHaveBeenCalledTimes(1)
    })

    test('shows access denied when authenticated but not developer', () => {
        mockAuthStore({ isAuthenticated: true, isDeveloper: false })
        mockFeatures()
        render(
            <MemoryRouter>
                <AdminPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('Access Denied')).toBeInTheDocument()
        expect(
            screen.getByText('This page is restricted to bot administrators.'),
        ).toBeInTheDocument()
    })

    test('shows loading skeletons when loading', () => {
        mockAuthStore({ isAuthenticated: true, isDeveloper: true })
        mockFeatures({ isLoading: true })
        const { container } = render(
            <MemoryRouter>
                <AdminPage />
            </MemoryRouter>,
        )
        expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    })

    test('renders admin panel with child sections for authenticated developer', () => {
        mockAuthStore({ isAuthenticated: true, isDeveloper: true })
        mockFeatures()
        render(
            <MemoryRouter>
                <AdminPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('Admin Panel')).toBeInTheDocument()
        expect(screen.getByTestId('global-toggles')).toBeInTheDocument()
        expect(screen.getByTestId('bot-guilds')).toBeInTheDocument()
    })

    test('shows error banner with retry button on load failure', () => {
        const retryLoad = vi.fn()
        mockAuthStore({ isAuthenticated: true, isDeveloper: true })
        mockFeatures({
            loadError: {
                kind: 'upstream',
                message: 'Discord API error',
                scope: 'catalog',
                status: 502,
            },
            retryLoad,
        })
        render(
            <MemoryRouter>
                <AdminPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('Unable to load feature data')).toBeInTheDocument()
        expect(screen.getByText('Discord API error')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    })

    test('shows re-authenticate link on auth error', () => {
        mockAuthStore({ isAuthenticated: true, isDeveloper: true })
        mockFeatures({
            loadError: {
                kind: 'auth',
                message: 'Session expired',
                scope: 'global',
                status: 401,
            },
        })
        render(
            <MemoryRouter>
                <AdminPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('Re-authenticate')).toBeInTheDocument()
    })

    test('does not show re-authenticate link on non-auth error', () => {
        mockAuthStore({ isAuthenticated: true, isDeveloper: true })
        mockFeatures({
            loadError: {
                kind: 'upstream',
                message: 'Server error',
                scope: 'catalog',
                status: 502,
            },
        })
        render(
            <MemoryRouter>
                <AdminPage />
            </MemoryRouter>,
        )
        expect(screen.queryByText('Re-authenticate')).not.toBeInTheDocument()
    })
})
