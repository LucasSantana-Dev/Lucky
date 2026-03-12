import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { useAuthStore } from '@/stores/authStore'

vi.mock('@/stores/authStore')

describe('App legal routes', () => {
    beforeEach(() => {
        vi.clearAllMocks()

        vi.mocked(useAuthStore).mockImplementation((selector) => {
            const store = {
                user: null,
                isAuthenticated: false,
                isLoading: false,
                isDeveloper: false,
                login: vi.fn(),
                logout: vi.fn(),
                checkAuth: vi.fn().mockResolvedValue(undefined),
                checkDeveloperStatus: vi.fn(),
            }

            return selector ? selector(store) : store
        })
    })

    function renderAt(path: string) {
        return render(
            <MemoryRouter initialEntries={[path]}>
                <App />
            </MemoryRouter>,
        )
    }

    test('renders terms page for canonical path while unauthenticated', async () => {
        renderAt('/terms-of-service')

        expect(
            await screen.findByRole('heading', { name: /terms of service/i }),
        ).toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: /login with discord/i }),
        ).not.toBeInTheDocument()
    })

    test('renders privacy page for canonical path while unauthenticated', async () => {
        renderAt('/privacy-policy')

        expect(
            await screen.findByRole('heading', { name: /privacy policy/i }),
        ).toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: /login with discord/i }),
        ).not.toBeInTheDocument()
    })

    test('renders terms page for alias path', async () => {
        renderAt('/terms')

        expect(
            await screen.findByRole('heading', { name: /terms of service/i }),
        ).toBeInTheDocument()
    })

    test('renders privacy page for alias path', async () => {
        renderAt('/privacy')

        expect(
            await screen.findByRole('heading', { name: /privacy policy/i }),
        ).toBeInTheDocument()
    })
})
