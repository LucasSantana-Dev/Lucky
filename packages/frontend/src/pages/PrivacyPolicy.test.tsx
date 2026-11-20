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
            screen.getByText(/last updated: November 20, 2026/i),
        ).toBeInTheDocument()
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
            screen.getByText(
                /does not sell or share personal data for advertising/i,
            ),
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

    test('lists every cookie and browser storage key the app uses', () => {
        renderPage()
        for (const key of [
            'sessionId',
            'spotify_state',
            'lastfm_state',
            'lucky-auth',
            'lucky-language',
            'auth_redirect_ts',
        ]) {
            expect(screen.getByText(key)).toBeInTheDocument()
        }
        expect(
            screen.getByText(/7 days, renewed on each visit/i),
        ).toBeInTheDocument()
        expect(screen.getByText(/^10 minutes$/i)).toBeInTheDocument()
    })

    test('names the processors', () => {
        renderPage()
        for (const name of [
            'Discord',
            'Sentry',
            'Cloudflare',
            'top.gg',
            'Stripe',
        ]) {
            expect(
                screen.getByText(name, { selector: 'strong' }),
            ).toBeInTheDocument()
        }
    })

    test('states the real retention windows', () => {
        renderPage()
        expect(
            screen.getByText(/Track history and server logs: 30 days/i),
        ).toBeInTheDocument()
        expect(
            screen.getByText(
                /Feedback, command usage and activation events: 180 days/i,
            ),
        ).toBeInTheDocument()
    })

    test('covers legal basis, transfers and rights sections', () => {
        renderPage()
        for (const heading of [
            /Cookies and storage/i,
            /Legal basis/i,
            /International transfers/i,
            /Your rights/i,
        ]) {
            expect(
                screen.getByRole('heading', { level: 2, name: heading }),
            ).toBeInTheDocument()
        }
        expect(screen.getByText(/LGPD \(Art\. 18\)/)).toBeInTheDocument()
    })

    test('links the deletion guide and the support contacts', () => {
        renderPage()
        expect(
            screen.getByRole('link', { name: /data deletion guide/i }),
        ).toHaveAttribute(
            'href',
            'https://github.com/LucasSantana-Dev/Lucky/blob/main/docs/DATA_RETENTION.md',
        )
        expect(
            screen.getByRole('link', { name: /Lucky support server/i }),
        ).toHaveAttribute(
            'href',
            expect.stringMatching(/^https:\/\/discord\.gg\//),
        )
        expect(
            screen.getByRole('link', {
                name: 'github.com/LucasSantana-Dev/Lucky/issues',
            }),
        ).toHaveAttribute(
            'href',
            'https://github.com/LucasSantana-Dev/Lucky/issues',
        )
    })
})
