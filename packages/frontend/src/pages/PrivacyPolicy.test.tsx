import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Privacy from './PrivacyPolicy'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { metaFor } from '@/lib/seo/routeMeta'

vi.mock('@/hooks/usePageMetadata')

function renderPage() {
    vi.mocked(usePageMetadata).mockImplementation(() => undefined)
    return render(
        <MemoryRouter>
            <Privacy />
        </MemoryRouter>,
    )
}

describe('PrivacyPolicy', () => {
    test('renders title and last updated', () => {
        renderPage()
        expect(
            screen.getByRole('heading', { level: 1, name: /Privacy Policy/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/last updated: March 18, 2026/i),
        ).toBeInTheDocument()
    })

    test('renders all section headings', () => {
        renderPage()
        for (const h of [
            'Scope and controller',
            'Data we collect',
            'How we use data',
            'Self-hosted instances',
            'Third-party services',
            'Retention and deletion',
            'Your rights',
            'Security',
        ]) {
            expect(
                screen.getAllByText(new RegExp(h, 'i')).length,
            ).toBeGreaterThanOrEqual(1)
        }
    })

    test('renders self-host disclosure paragraph', () => {
        renderPage()
        expect(
            screen.getByText(
                /project maintainers do not receive any of your guild or user data/i,
            ),
        ).toBeInTheDocument()
    })

    test('does not sell personal data', () => {
        renderPage()
        expect(
            screen.getByText(/does not sell personal data/i),
        ).toBeInTheDocument()
    })

    test('renders sibling nav to Terms', () => {
        renderPage()
        const terms = screen.getAllByRole('link', { name: /Terms of Service/i })
        expect(terms.length).toBeGreaterThanOrEqual(1)
        expect(terms[0]).toHaveAttribute('href', '/terms')
    })

    test('sets page metadata from the route map', () => {
        renderPage()
        expect(usePageMetadata).toHaveBeenCalledWith(metaFor('/privacy-policy'))
    })
})
