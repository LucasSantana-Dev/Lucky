import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SpotifyPage from './Spotify'
import { api } from '@/services/api'

vi.mock('@/services/api')

function renderPage() {
    return render(
        <MemoryRouter>
            <SpotifyPage />
        </MemoryRouter>,
    )
}

describe('SpotifyPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows loading spinner initially', () => {
        vi.mocked(api.spotify.status).mockImplementation(
            () => new Promise(() => {}),
        )
        renderPage()
        expect(document.querySelector('.animate-pulse')).toBeInTheDocument()
    })

    test('shows not configured when spotify is not set up', async () => {
        vi.mocked(api.spotify.status).mockResolvedValue({
            data: { configured: false, linked: false, username: null },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Not Configured')).toBeInTheDocument()
        })

        expect(screen.getByText(/SPOTIFY_CLIENT_ID/)).toBeInTheDocument()
    })

    test('shows connected state with username', async () => {
        vi.mocked(api.spotify.status).mockResolvedValue({
            data: { configured: true, linked: true, username: 'spotifyuser' },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Connected')).toBeInTheDocument()
        })

        expect(screen.getByText('spotifyuser')).toBeInTheDocument()
        expect(screen.getByText('Disconnect')).toBeInTheDocument()
    })

    test('shows connect button when not linked', async () => {
        vi.mocked(api.spotify.status).mockResolvedValue({
            data: { configured: true, linked: false, username: null },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Connect Your Account')).toBeInTheDocument()
        })

        expect(screen.getByText('Connect with Spotify')).toBeInTheDocument()
    })

    test('shows error on fetch failure', async () => {
        vi.mocked(api.spotify.status).mockRejectedValue(
            new Error('Network error'),
        )

        renderPage()

        await waitFor(() => {
            expect(
                screen.getByText('Failed to load Spotify status'),
            ).toBeInTheDocument()
        })
    })

    test('unlink calls api and updates state', async () => {
        const user = userEvent.setup()
        vi.mocked(api.spotify.status).mockResolvedValue({
            data: { configured: true, linked: true, username: 'spotifyuser' },
        } as any)
        vi.mocked(api.spotify.unlink).mockResolvedValue({
            data: { success: true },
        } as any)
        vi.spyOn(window, 'confirm').mockReturnValue(true)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Disconnect')).toBeInTheDocument()
        })

        await user.click(screen.getByText('Disconnect'))

        expect(api.spotify.unlink).toHaveBeenCalled()

        await waitFor(() => {
            expect(screen.getByText('Connect Your Account')).toBeInTheDocument()
        })
    })

    test('shows how it works section', async () => {
        vi.mocked(api.spotify.status).mockResolvedValue({
            data: { configured: true, linked: false, username: null },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('How it works')).toBeInTheDocument()
        })

        expect(
            screen.getByText(/Your library stays private/),
        ).toBeInTheDocument()
    })
})
