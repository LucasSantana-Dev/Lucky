import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Terms from './TermsOfService'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { metaFor } from '@/lib/seo/routeMeta'

vi.mock('@/hooks/usePageMetadata')

function renderPage() {
    vi.mocked(usePageMetadata).mockImplementation(() => undefined)
    return render(
        <MemoryRouter>
            <Terms />
        </MemoryRouter>,
    )
}

describe('TermsOfService', () => {
    test('renders title and last updated', () => {
        renderPage()
        expect(
            screen.getByRole('heading', {
                level: 1,
                name: /Terms of Service/i,
            }),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/last updated: March 18, 2026/i),
        ).toBeInTheDocument()
    })

    test('renders all section headings', () => {
        renderPage()
        for (const h of [
            'Acceptance',
            'Service scope',
            'Acceptable use',
            'Third-party services',
            'Suspension and termination',
            'Contact',
        ]) {
            expect(screen.getAllByText(h).length).toBeGreaterThanOrEqual(1)
        }
    })

    test('renders sibling nav to Privacy Policy', () => {
        renderPage()
        const privacy = screen.getAllByRole('link', { name: /Privacy Policy/i })
        expect(privacy.length).toBeGreaterThanOrEqual(1)
        expect(privacy[0]).toHaveAttribute('href', '/privacy')
    })

    test('contact link points to github issues', () => {
        renderPage()
        const link = screen.getByRole('link', {
            name: /^github\.com\/LucasSantana-Dev\/Lucky\/issues$/i,
        })
        expect(link).toHaveAttribute(
            'href',
            'https://github.com/LucasSantana-Dev/Lucky/issues',
        )
    })

    test('sets page metadata from the route map', () => {
        renderPage()
        expect(usePageMetadata).toHaveBeenCalledWith(
            metaFor('/terms-of-service'),
        )
    })
})
