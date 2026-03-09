import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from './Login'
import { useAuthStore } from '@/stores/authStore'

vi.mock('@/stores/authStore')

vi.mock('@/hooks/useAuthRedirect', () => ({
    useAuthRedirect: vi.fn(),
}))

vi.mock('@/hooks/usePageMetadata', () => ({
    usePageMetadata: vi.fn(),
}))

describe('Login', () => {
    const mockLogin = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
    })

    const mockAuthStore = (isLoading = false) => {
        vi.mocked(useAuthStore).mockImplementation((selector) => {
            const store = {
                user: null,
                isAuthenticated: false,
                isLoading,
                isDeveloper: false,
                login: mockLogin,
                logout: vi.fn(),
                checkAuth: vi.fn(),
                checkDeveloperStatus: vi.fn(),
            }
            return selector ? selector(store) : store
        })
    }

    const renderLogin = () => {
        return render(
            <MemoryRouter>
                <LoginPage />
            </MemoryRouter>,
        )
    }

    test('renders login page with Discord OAuth button', () => {
        mockAuthStore(false)

        renderLogin()

        expect(screen.getByText('Lucky')).toBeInTheDocument()
        expect(
            screen.getByText('Welcome to Lucky Dashboard'),
        ).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: /login with discord/i }),
        ).toBeInTheDocument()
    })

    test('login button calls login function', async () => {
        const user = userEvent.setup()
        mockAuthStore(false)

        renderLogin()

        const loginButton = screen.getByRole('button', {
            name: /login with discord/i,
        })
        await user.click(loginButton)

        expect(mockLogin).toHaveBeenCalledTimes(1)
    })

    test('shows loading state when isLoading is true', () => {
        mockAuthStore(true)

        renderLogin()

        expect(screen.getByText(/connecting/i)).toBeInTheDocument()
        const loginButton = screen.getByRole('button', {
            name: /connecting/i,
        })
        expect(loginButton).toBeDisabled()
    })

    test('displays feature statistics', () => {
        mockAuthStore(false)

        renderLogin()

        expect(screen.getByText('32+')).toBeInTheDocument()
        expect(screen.getByText('Modules')).toBeInTheDocument()
        expect(screen.getByText('100+')).toBeInTheDocument()
        expect(screen.getByText('Commands')).toBeInTheDocument()
        expect(screen.getByText('24/7')).toBeInTheDocument()
        expect(screen.getByText('Uptime')).toBeInTheDocument()
    })

    test('renders branding elements', () => {
        mockAuthStore(false)

        renderLogin()

        expect(screen.getByText('Discord Bot Management')).toBeInTheDocument()
        expect(
            screen.getByText(/manage your discord servers/i),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/© 2026 Lucky. All rights reserved./i),
        ).toBeInTheDocument()
    })
})
