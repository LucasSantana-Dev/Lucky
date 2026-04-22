import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ConfigPage from './Config'
import { useGuildSelection } from '@/hooks/useGuildSelection'

vi.mock('@/hooks/useGuildSelection')
vi.mock('@/hooks/usePageMetadata', () => ({ usePageMetadata: vi.fn() }))
vi.mock('@/components/Config/MusicConfig', () => ({
    default: () => <div>MusicConfig</div>,
}))
vi.mock('@/components/Config/CommandsConfig', () => ({
    default: () => <div>CommandsConfig</div>,
}))
vi.mock('@/components/Config/ModerationConfig', () => ({
    default: () => <div>ModerationConfig</div>,
}))
vi.mock('@/components/ui/LoadingSpinner', () => ({
    default: () => <div>Loading...</div>,
}))

const mockGuild = { id: '123', name: 'Test Guild' }

describe('ConfigPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows select server message when no guild', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: null,
        } as any)
        render(
            <MemoryRouter>
                <ConfigPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('Configuration')).toBeInTheDocument()
        expect(
            screen.getByText('Please select a server to configure'),
        ).toBeInTheDocument()
    })

    test('shows module cards when guild selected', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        render(
            <MemoryRouter>
                <ConfigPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('Music Module')).toBeInTheDocument()
        expect(screen.getByText('Commands')).toBeInTheDocument()
        expect(screen.getByText('Moderation')).toBeInTheDocument()
    })

    test('clicking module card shows back button', async () => {
        const user = userEvent.setup()
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        render(
            <MemoryRouter>
                <ConfigPage />
            </MemoryRouter>,
        )

        const musicCard = screen.getByRole('button', { name: /Music Module/i })
        await user.click(musicCard)

        expect(screen.getByText('← Back')).toBeInTheDocument()
    })

    test('clicking back returns to module selection', async () => {
        const user = userEvent.setup()
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        render(
            <MemoryRouter>
                <ConfigPage />
            </MemoryRouter>,
        )

        const musicCard = screen.getByRole('button', { name: /Music Module/i })
        await user.click(musicCard)

        const backButton = screen.getByText('← Back')
        await user.click(backButton)

        expect(screen.getByText('Music Module')).toBeInTheDocument()
        expect(screen.getByText('Commands')).toBeInTheDocument()
    })
})
