import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Changelog from './Changelog'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { metaFor } from '@/lib/seo/routeMeta'

vi.mock('@/hooks/usePageMetadata')

function renderPage() {
    vi.mocked(usePageMetadata).mockImplementation(() => undefined)
    return render(
        <MemoryRouter>
            <Changelog />
        </MemoryRouter>,
    )
}

describe('Changelog', () => {
    test('renders page title', () => {
        renderPage()
        expect(
            screen.getByRole('heading', { level: 1, name: /Changelog/i }),
        ).toBeInTheDocument()
    })

    test('renders at least one version from CHANGELOG.md', () => {
        renderPage()
        // Latest shipped version
        expect(screen.getAllByText(/v2\.11\.0/).length).toBeGreaterThanOrEqual(
            1,
        )
    })

    test('renders section headings (Added / Fixed / Changed)', () => {
        renderPage()
        expect(screen.getAllByText(/^Added$/i).length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText(/^Fixed$/i).length).toBeGreaterThanOrEqual(1)
    })

    test('links PR references to github', () => {
        renderPage()
        const prLinks = screen.getAllByRole('link', { name: /^#\d+/ })
        expect(prLinks.length).toBeGreaterThanOrEqual(1)
        expect(prLinks[0]).toHaveAttribute(
            'href',
            expect.stringMatching(
                /^https:\/\/github\.com\/LucasSantana-Dev\/Lucky\/pull\/\d+$/,
            ),
        )
    })

    test('renders version sidebar', () => {
        renderPage()
        expect(screen.getAllByText(/Versions/i).length).toBeGreaterThanOrEqual(
            1,
        )
    })

    test('sets page metadata from the route map', () => {
        renderPage()
        expect(usePageMetadata).toHaveBeenCalledWith(metaFor('/changelog'))
    })
})
