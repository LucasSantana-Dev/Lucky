import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SupportPage from './Support'
import { api } from '@/services/api'

vi.mock('@/services/api', () => ({
    api: { support: { submit: vi.fn() } },
}))

const submitMock = api.support.submit as unknown as ReturnType<typeof vi.fn>

function renderAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <SupportPage />
        </MemoryRouter>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    submitMock.mockResolvedValue({ id: 'rep_1' })
})

describe('SupportPage', () => {
    test('renders the form with a disabled submit until context is filled', () => {
        renderAt('/support')
        expect(screen.getByText('Report a problem')).toBeInTheDocument()
        const submit = screen.getByRole('button', { name: /Send report/i })
        expect(submit).toBeDisabled()

        fireEvent.change(screen.getByLabelText('What happened?'), {
            target: { value: 'play button broke' },
        })
        expect(submit).toBeEnabled()
    })

    test('shows the reference id when cid is in the query', () => {
        renderAt('/support?cid=ABC12345')
        expect(screen.getAllByText('ABC12345').length).toBeGreaterThan(0)
    })

    test('submits context (+ prefilled cid/category) and shows success', async () => {
        renderAt('/support?cid=ABC12345&category=web-error&guildId=123')
        fireEvent.change(screen.getByLabelText('What happened?'), {
            target: { value: '  it crashed  ' },
        })
        fireEvent.click(screen.getByRole('button', { name: /Send report/i }))

        await waitFor(() =>
            expect(
                screen.getByText('Thanks for the report'),
            ).toBeInTheDocument(),
        )
        expect(submitMock).toHaveBeenCalledTimes(1)
        const fd = submitMock.mock.calls[0][0] as FormData
        expect(fd.get('context')).toBe('it crashed')
        expect(fd.get('cid')).toBe('ABC12345')
        expect(fd.get('category')).toBe('web-error')
        expect(fd.get('guildId')).toBe('123')
        // dedup key (#1319): present and uuid-shaped
        expect(String(fd.get('sid'))).toMatch(/^[0-9a-f-]{36}$/)
    })

    test('surfaces the server error message on failure', async () => {
        submitMock.mockRejectedValue(new Error('rate limited'))
        renderAt('/support')
        fireEvent.change(screen.getByLabelText('What happened?'), {
            target: { value: 'broken' },
        })
        fireEvent.click(screen.getByRole('button', { name: /Send report/i }))

        await waitFor(() =>
            expect(screen.getByText('rate limited')).toBeInTheDocument(),
        )
        expect(
            screen.queryByText('Thanks for the report'),
        ).not.toBeInTheDocument()
    })

    test('retries reuse the same dedup key so the server can dedup (#1319)', async () => {
        submitMock.mockRejectedValueOnce(new Error('network flake'))
        submitMock.mockResolvedValueOnce({ id: 'rep_1' })
        renderAt('/support')
        fireEvent.change(screen.getByLabelText('What happened?'), {
            target: { value: 'broken' },
        })
        fireEvent.click(screen.getByRole('button', { name: /Send report/i }))
        await waitFor(() =>
            expect(screen.getByText('network flake')).toBeInTheDocument(),
        )

        fireEvent.click(screen.getByRole('button', { name: /Send report/i }))
        await waitFor(() =>
            expect(
                screen.getByText('Thanks for the report'),
            ).toBeInTheDocument(),
        )

        expect(submitMock).toHaveBeenCalledTimes(2)
        const first = submitMock.mock.calls[0][0] as FormData
        const second = submitMock.mock.calls[1][0] as FormData
        expect(first.get('sid')).toBe(second.get('sid'))
    })

    test('rejects an unsupported image type', () => {
        renderAt('/support')
        const file = new File(['x'], 'a.gif', { type: 'image/gif' })
        fireEvent.change(screen.getByLabelText('Screenshot (optional)'), {
            target: { files: [file] },
        })
        expect(screen.getByText(/Unsupported image type/i)).toBeInTheDocument()
    })

    test('rejects an oversized image', () => {
        renderAt('/support')
        const file = new File(['x'], 'big.png', { type: 'image/png' })
        Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 })
        fireEvent.change(screen.getByLabelText('Screenshot (optional)'), {
            target: { files: [file] },
        })
        expect(screen.getByText(/too large/i)).toBeInTheDocument()
    })
})
