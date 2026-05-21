import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Docs from './Docs'
import { usePageMetadata } from '@/hooks/usePageMetadata'

vi.mock('@/hooks/usePageMetadata')

function renderAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Docs />
        </MemoryRouter>,
    )
}

describe('Docs', () => {
    test('renders Overview by default', () => {
        vi.mocked(usePageMetadata).mockImplementation(() => undefined)
        renderAt('/docs')
        expect(screen.getAllByRole('heading', { level: 1, name: /Overview/i }).length).toBeGreaterThanOrEqual(1)
    })

    test('renders Quick start page when ?page=quickstart', () => {
        vi.mocked(usePageMetadata).mockImplementation(() => undefined)
        renderAt('/docs?page=quickstart')
        expect(screen.getByRole('heading', { level: 1, name: /Quick start/i })).toBeInTheDocument()
    })

    test('renders Self-host page with docker compose snippet', () => {
        vi.mocked(usePageMetadata).mockImplementation(() => undefined)
        renderAt('/docs?page=self-host')
        expect(screen.getByRole('heading', { level: 1, name: /Self-host/i })).toBeInTheDocument()
        expect(screen.getAllByText(/docker compose/i).length).toBeGreaterThanOrEqual(1)
    })

    test('falls back to Overview for unknown slug', () => {
        vi.mocked(usePageMetadata).mockImplementation(() => undefined)
        renderAt('/docs?page=does-not-exist')
        expect(screen.getAllByRole('heading', { level: 1, name: /Overview/i }).length).toBeGreaterThanOrEqual(1)
    })

    test('renders sidebar nav groups', () => {
        vi.mocked(usePageMetadata).mockImplementation(() => undefined)
        renderAt('/docs')
        expect(screen.getAllByText(/Getting started/i).length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText(/Using Lucky/i).length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText(/Reference/i).length).toBeGreaterThanOrEqual(1)
    })
})
