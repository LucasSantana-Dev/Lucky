import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LyricsPage from './Lyrics'
import { useGuildSelection } from '@/hooks/useGuildSelection'
import { api } from '@/services/api'

vi.mock('@/hooks/useGuildSelection')
vi.mock('@/services/api')

const mockGuild = { id: '123', name: 'Test Guild' }

describe('LyricsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows no server message when no guild', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: null,
        } as any)
        render(
            <MemoryRouter>
                <LyricsPage />
            </MemoryRouter>,
        )
        expect(
            screen.getByText('Select a server to search lyrics'),
        ).toBeInTheDocument()
    })

    test('renders search form when guild selected', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        render(
            <MemoryRouter>
                <LyricsPage />
            </MemoryRouter>,
        )
        expect(screen.getByText('Lyrics Search')).toBeInTheDocument()
        expect(screen.getByLabelText(/Song Title/)).toBeInTheDocument()
        expect(screen.getByLabelText(/Artist/)).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: /Search/ }),
        ).toBeInTheDocument()
    })

    test('shows initial help text before searching', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        render(
            <MemoryRouter>
                <LyricsPage />
            </MemoryRouter>,
        )
        expect(
            screen.getByText('Search for lyrics by entering a song title'),
        ).toBeInTheDocument()
    })

    test('search button is disabled when title is empty', () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        render(
            <MemoryRouter>
                <LyricsPage />
            </MemoryRouter>,
        )
        expect(screen.getByRole('button', { name: /Search/ })).toBeDisabled()
    })

    test('submits search and shows results', async () => {
        const user = userEvent.setup()
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        vi.mocked(api.lyrics.search).mockResolvedValue({
            data: {
                lyrics: 'Hello, is it me\nyou looking for?',
                title: 'Hello',
                artist: 'Lionel Richie',
            },
        } as any)

        render(
            <MemoryRouter>
                <LyricsPage />
            </MemoryRouter>,
        )

        await user.type(screen.getByLabelText(/Song Title/), 'Hello')
        await user.type(screen.getByLabelText(/Artist/), 'Lionel Richie')
        await user.click(screen.getByRole('button', { name: /Search/ }))

        await waitFor(() => {
            expect(screen.getByText('Hello')).toBeInTheDocument()
            expect(screen.getByText('Lionel Richie')).toBeInTheDocument()
        })

        expect(api.lyrics.search).toHaveBeenCalledWith('Hello', 'Lionel Richie')
    })

    test('shows error on failed search', async () => {
        const user = userEvent.setup()
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        vi.mocked(api.lyrics.search).mockRejectedValue(
            new Error('Network error'),
        )

        render(
            <MemoryRouter>
                <LyricsPage />
            </MemoryRouter>,
        )

        await user.type(screen.getByLabelText(/Song Title/), 'Test Song')
        await user.click(screen.getByRole('button', { name: /Search/ }))

        await waitFor(() => {
            expect(
                screen.getByText('Failed to fetch lyrics. Please try again.'),
            ).toBeInTheDocument()
        })
    })

    test('shows no lyrics found when search returns empty', async () => {
        const user = userEvent.setup()
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        vi.mocked(api.lyrics.search).mockResolvedValue({ data: null } as any)

        render(
            <MemoryRouter>
                <LyricsPage />
            </MemoryRouter>,
        )

        await user.type(screen.getByLabelText(/Song Title/), 'Unknown Song')
        await user.click(screen.getByRole('button', { name: /Search/ }))

        await waitFor(() => {
            expect(screen.getByText('No lyrics found')).toBeInTheDocument()
        })
    })

    test('shows loading state during search', async () => {
        vi.mocked(useGuildSelection).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
        vi.mocked(api.lyrics.search).mockImplementation(
            () => new Promise(() => {}),
        )

        const user = userEvent.setup()
        render(
            <MemoryRouter>
                <LyricsPage />
            </MemoryRouter>,
        )

        await user.type(screen.getByLabelText(/Song Title/), 'Test')
        await user.click(screen.getByRole('button', { name: /Search/ }))

        expect(screen.getByText('Searching...')).toBeInTheDocument()
        const skeletons = document.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })
})
