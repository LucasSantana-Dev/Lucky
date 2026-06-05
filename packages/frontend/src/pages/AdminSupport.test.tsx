import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import AdminSupportPage from './AdminSupport'
import { api } from '@/services/api'

vi.mock('@/services/api', () => ({
    api: {
        support: {
            listAdmin: vi.fn(),
            getAdmin: vi.fn(),
            imageUrl: (id: string) => `/api/admin/support/${id}/image`,
        },
    },
}))

const listMock = api.support.listAdmin as unknown as ReturnType<typeof vi.fn>
const getMock = api.support.getAdmin as unknown as ReturnType<typeof vi.fn>

function renderPage() {
    const qc = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter>
                <AdminSupportPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

const row = {
    id: 'rep_1',
    createdAt: '2026-06-05T00:00:00.000Z',
    context: 'play crashed',
    imageMimeType: 'image/png',
    correlationId: 'ABC12345',
    guildId: '123',
    surface: 'web',
    errorCategory: 'web-error',
    status: 'new',
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe('AdminSupportPage', () => {
    test('renders a report list', async () => {
        listMock.mockResolvedValue([row])
        renderPage()
        expect(await screen.findByText('play crashed')).toBeInTheDocument()
        expect(screen.getByText('Support reports')).toBeInTheDocument()
    })

    test('shows the empty state when there are no reports', async () => {
        listMock.mockResolvedValue([])
        renderPage()
        expect(await screen.findByText('No reports')).toBeInTheDocument()
    })

    test('shows an error state when the list fails', async () => {
        listMock.mockRejectedValue(new Error('boom'))
        renderPage()
        expect(
            await screen.findByText('Could not load reports.'),
        ).toBeInTheDocument()
    })

    test('selecting a report loads its detail + image', async () => {
        listMock.mockResolvedValue([row])
        getMock.mockResolvedValue({
            ...row,
            hasImage: true,
            rateLimitKey: null,
        })
        renderPage()

        fireEvent.click(await screen.findByText('play crashed'))

        await waitFor(() => expect(getMock).toHaveBeenCalledWith('rep_1'))
        const img = await screen.findByRole('img', {
            name: 'Report screenshot',
        })
        expect(img).toHaveAttribute('src', '/api/admin/support/rep_1/image')
    })

    test('filters by status', async () => {
        listMock.mockResolvedValue([])
        renderPage()
        await screen.findByText('No reports')
        fireEvent.click(screen.getByRole('button', { name: 'Promoted' }))
        await waitFor(() =>
            expect(listMock).toHaveBeenCalledWith({ status: 'promoted' }),
        )
    })
})
