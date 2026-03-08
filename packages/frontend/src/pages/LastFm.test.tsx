import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LastFmPage from './LastFm'
import { api } from '@/services/api'

vi.mock('@/services/api')

function renderPage() {
    return render(
        <MemoryRouter>
            <LastFmPage />
        </MemoryRouter>,
    )
}

describe('LastFmPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows loading spinner initially', () => {
        vi.mocked(api.lastfm.status).mockReturnValue(new Promise(() => {}))
        renderPage()
        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    })

    test('shows not configured when lastfm is not set up', async () => {
        vi.mocked(api.lastfm.status).mockResolvedValue({
            data: { configured: false, linked: false, username: null },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Not Configured')).toBeInTheDocument()
        })

        expect(screen.getByText(/LASTFM_API_KEY/)).toBeInTheDocument()
    })

    test('shows connected state with username', async () => {
        vi.mocked(api.lastfm.status).mockResolvedValue({
            data: { configured: true, linked: true, username: 'luksobrio' },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Connected')).toBeInTheDocument()
        })

        expect(screen.getByText('luksobrio')).toBeInTheDocument()
        expect(screen.getByText('Disconnect')).toBeInTheDocument()
    })

    test('shows connect button when not linked', async () => {
        vi.mocked(api.lastfm.status).mockResolvedValue({
            data: { configured: true, linked: false, username: null },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Connect Your Account')).toBeInTheDocument()
        })

        expect(screen.getByText('Connect Last.fm')).toBeInTheDocument()
    })

    test('shows error on fetch failure', async () => {
        vi.mocked(api.lastfm.status).mockRejectedValue(
            new Error('Network error'),
        )

        renderPage()

        await waitFor(() => {
            expect(
                screen.getByText('Failed to load Last.fm status'),
            ).toBeInTheDocument()
        })
    })

    test('unlink calls api and updates state', async () => {
        const user = userEvent.setup()
        vi.mocked(api.lastfm.status).mockResolvedValue({
            data: { configured: true, linked: true, username: 'luksobrio' },
        } as any)
        vi.mocked(api.lastfm.unlink).mockResolvedValue({
            data: { success: true },
        } as any)
        vi.spyOn(window, 'confirm').mockReturnValue(true)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Disconnect')).toBeInTheDocument()
        })

        await user.click(screen.getByText('Disconnect'))

        expect(api.lastfm.unlink).toHaveBeenCalled()

        await waitFor(() => {
            expect(screen.getByText('Connect Your Account')).toBeInTheDocument()
        })
    })

    test('shows how it works section', async () => {
        vi.mocked(api.lastfm.status).mockResolvedValue({
            data: { configured: true, linked: false, username: null },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('How it works')).toBeInTheDocument()
        })

        expect(screen.getByText(/External music bots/)).toBeInTheDocument()
    })
})
