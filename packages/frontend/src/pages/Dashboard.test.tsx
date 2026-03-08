import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from './Dashboard'
import { useGuildSelection } from '@/hooks/useGuildSelection'

vi.mock('@/hooks/useGuildSelection')
vi.mock('@/hooks/usePageMetadata', () => ({ usePageMetadata: vi.fn() }))
vi.mock('@/components/Dashboard/ServerGrid', () => ({
    default: () => <div data-testid='server-grid'>ServerGrid</div>,
}))

const mockGuild = { id: '123', name: 'Test Guild' }

describe('DashboardPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows no server selected when no guild', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: null,
        } as any)
        render(
            <MemoryRouter>
                <DashboardPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('No Server Selected')).toBeInTheDocument()
        expect(screen.getByText('View Your Servers')).toBeInTheDocument()
    })

    test('shows dashboard with server grid when guild selected', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        render(
            <MemoryRouter>
                <DashboardPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
        expect(screen.getByTestId('server-grid')).toBeInTheDocument()
    })
})
