import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'
import { reportError } from '@/lib/sentry'

vi.mock('@/lib/sentry', () => ({
    reportError: vi.fn(),
}))

function Boom(): never {
    throw new Error('kaboom')
}

let consoleErr: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    vi.clearAllMocks()
    consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    consoleErr.mockRestore()
})

describe('ErrorBoundary', () => {
    test('renders children when there is no error', () => {
        render(
            <ErrorBoundary>
                <div>all good</div>
            </ErrorBoundary>,
        )
        expect(screen.getByText('all good')).toBeInTheDocument()
    })

    test('shows the fallback with an Error ID and a report link, and reports to Sentry', () => {
        render(
            <ErrorBoundary>
                <Boom />
            </ErrorBoundary>,
        )

        expect(screen.getByText('Something went wrong')).toBeInTheDocument()
        expect(screen.getByText('kaboom')).toBeInTheDocument()

        const report = screen.getByRole('link', {
            name: /Report this problem/i,
        })
        const href = report.getAttribute('href') ?? ''
        expect(href).toMatch(/^\/support\?category=web-error&cid=[A-Za-z0-9]+$/)

        const cid = new URL(href, 'http://x').searchParams.get('cid')
        expect(cid).toBeTruthy()
        expect(screen.getByText(cid as string)).toBeInTheDocument()

        expect(reportError).toHaveBeenCalledTimes(1)
        expect(reportError).toHaveBeenCalledWith(
            'ErrorBoundary caught an error',
            expect.any(Error),
            expect.objectContaining({ correlationId: cid }),
        )
    })
})
