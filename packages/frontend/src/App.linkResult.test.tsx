import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { toast } from 'sonner'
import App from './App'
import { useAuthStore } from '@/stores/authStore'
import { useGuildStore } from '@/stores/guildStore'

vi.mock('@/stores/authStore')
vi.mock('@/stores/guildStore')
vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('./pages/Landing', () => ({
    default: () => <h1>Landing Page</h1>,
}))

describe('App link result feedback', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        const auth = {
            isAuthenticated: false,
            isLoading: false,
            checkAuth: async () => {},
        }
        vi.mocked(useAuthStore).mockImplementation(((
            selector?: (v: typeof auth) => unknown,
        ) => (selector ? selector(auth) : auth)) as typeof useAuthStore)
        vi.mocked(useGuildStore).mockImplementation(
            (() => ({})) as unknown as typeof useGuildStore,
        )
    })

    test('toasts on the landing page for an unauthenticated visitor', async () => {
        render(
            <MemoryRouter initialEntries={['/?error=spotify_invalid_state']}>
                <App />
            </MemoryRouter>,
        )
        await screen.findByText('Landing Page')
        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith(
                'linkResult.errors.spotify_invalid_state',
            ),
        )
        expect(toast.error).toHaveBeenCalledTimes(1)
    })
})
