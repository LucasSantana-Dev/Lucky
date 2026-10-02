import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import App from './App'
import { useAuthStore } from '@/stores/authStore'
import { useGuildStore } from '@/stores/guildStore'

vi.mock('@/stores/authStore')
vi.mock('@/stores/guildStore')

vi.mock('./components/Layout/Layout', () => ({
    default: ({ children }: { children: ReactNode }) => (
        <div data-testid='layout'>
            <nav aria-label='Sidebar' />
            {children}
        </div>
    ),
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
})
