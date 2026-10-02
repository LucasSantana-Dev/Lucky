import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import App from './App'
import { useAuthStore } from '@/stores/authStore'
import { useGuildStore } from '@/stores/guildStore'

vi.mock('@/stores/authStore')
vi.mock('@/stores/guildStore')

vi.mock('./components/Layout/Layout', () => ({
    default: ({ children }: { children: ReactNode }) => (
        <div data-testid='layout'>
            <nav aria-label='Sidebar'>
                <Link to='/servers'>Go to servers</Link>
            </nav>
            {children}
        </div>
    ),
}))

vi.mock('./pages/ServersPage', () => ({
    default: () => <h1>Servers Page</h1>,
}))

vi.mock('./pages/Moderation', () => ({
    default: () => {
        throw new Error('moderation exploded')
    },
}))

describe('App route error boundary', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.mocked(useAuthStore).mockReturnValue({
            isAuthenticated: true,
            isLoading: false,
            checkAuth: async () => {},
        } as never)
        vi.mocked(useGuildStore).mockReturnValue({
            selectedGuild: null,
            memberContext: null,
            memberContextLoading: false,
        } as never)
    })

    test('keeps the layout mounted when a page throws while rendering', async () => {
        render(
            <MemoryRouter initialEntries={['/moderation']}>
                <App />
            </MemoryRouter>,
        )

        expect(
            await screen.findByText('moderation exploded'),
        ).toBeInTheDocument()
        expect(screen.getByTestId('layout')).toBeInTheDocument()
        expect(
            screen.getByRole('navigation', { name: 'Sidebar' }),
        ).toBeInTheDocument()
    })

    test('clears the error when navigating to another route', async () => {
        render(
            <MemoryRouter initialEntries={['/moderation']}>
                <App />
            </MemoryRouter>,
        )
        await screen.findByText('moderation exploded')

        fireEvent.click(screen.getByRole('link', { name: 'Go to servers' }))

        expect(
            await screen.findByRole('heading', { name: 'Servers Page' }),
        ).toBeInTheDocument()
        expect(
            screen.queryByText('moderation exploded'),
        ).not.toBeInTheDocument()
        expect(screen.getByTestId('layout')).toBeInTheDocument()
    })
})
