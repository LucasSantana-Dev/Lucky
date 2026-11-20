import { beforeAll, describe, test, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Changelog from './Changelog'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { metaFor } from '@/lib/seo/routeMeta'
import { loadChangelogSource } from '@/lib/changelogSource'

vi.mock('@/hooks/usePageMetadata')
vi.mock('@/lib/changelogSource', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('@/lib/changelogSource')>()
    return { loadChangelogSource: vi.fn(actual.loadChangelogSource) }
})

function renderPage() {
    vi.mocked(usePageMetadata).mockImplementation(() => undefined)
    return render(
        <MemoryRouter>
            <Changelog />
        </MemoryRouter>,
    )
}

describe('Changelog', { timeout: 20000 }, () => {
    beforeAll(async () => {
        // Load the large CHANGELOG chunk once so each test's findBy (1s) does
        // not race a cold dynamic import.
        await loadChangelogSource()
    })

    test('renders page title', () => {
        renderPage()
        expect(
            screen.getByRole('heading', { level: 1, name: /Changelog/i }),
        ).toBeInTheDocument()
    })

    test('renders at least one version from CHANGELOG.md', async () => {
        renderPage()
        await screen.findAllByText(/^Added$/i)
        expect(screen.getAllByText(/v2\.11\.0/).length).toBeGreaterThanOrEqual(
            1,
        )
    })

    test('renders section headings (Added / Fixed / Changed)', async () => {
        renderPage()
        await screen.findAllByText(/^Added$/i)
        expect(screen.getAllByText(/^Added$/i).length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText(/^Fixed$/i).length).toBeGreaterThanOrEqual(1)
    })

    test('links PR references to github', async () => {
        renderPage()
        await screen.findAllByText(/^Added$/i)
        const prLinks = screen.getAllByRole('link', { name: /^#\d+/ })
        expect(prLinks.length).toBeGreaterThanOrEqual(1)
        expect(prLinks[0]).toHaveAttribute(
            'href',
            expect.stringMatching(
                /^https:\/\/github\.com\/LucasSantana-Dev\/Lucky\/(pull|issues)\/\d+$/,
            ),
        )
    })

    test('renders version sidebar', async () => {
        renderPage()
        await screen.findAllByText(/^Added$/i)
        expect(screen.getAllByText(/Versions/i).length).toBeGreaterThanOrEqual(
            1,
        )
    })

    test('sets page metadata from the route map', () => {
        renderPage()
        expect(usePageMetadata).toHaveBeenCalledWith(metaFor('/changelog'))
    })

    test('shows a loading state before the changelog resolves', async () => {
        renderPage()
        expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
        await waitFor(() =>
            expect(screen.queryByRole('status')).not.toBeInTheDocument(),
        )
    })

    test('shows an error state when the changelog fails to load', async () => {
        vi.mocked(loadChangelogSource).mockRejectedValueOnce(
            new Error('chunk failed'),
        )
        renderPage()
        expect(await screen.findByRole('alert')).toHaveTextContent(
            /could not load/i,
        )
    })

    test('renders bold and markdown links instead of raw syntax', async () => {
        vi.mocked(loadChangelogSource).mockResolvedValueOnce(
            [
                '## [9.9.9] - 2026-01-02',
                '### Fixed',
                '- **bot:** repair queue ([#3090](https://github.com/LucasSantana-Dev/Lucky/pull/3090)) and `code`',
            ].join('\n'),
        )
        const { container } = renderPage()
        const bold = await screen.findByText('bot:')
        expect(bold.tagName).toBe('STRONG')
        const link = screen.getByRole('link', { name: '#3090' })
        expect(link).toHaveAttribute(
            'href',
            'https://github.com/LucasSantana-Dev/Lucky/pull/3090',
        )
        expect(link.querySelector('a')).toBeNull()
        expect(screen.getAllByRole('link', { name: /#3090/ })).toHaveLength(1)
        expect(container.textContent).not.toMatch(/\*\*|\]\(/)
        expect(screen.getByText('code').tagName).toBe('CODE')
    })

    test('keeps issue hrefs, uppercase schemes and parenthesised urls', async () => {
        vi.mocked(loadChangelogSource).mockResolvedValueOnce(
            [
                '## [9.9.8] - 2026-01-01',
                '### Fixed',
                '- fix a ([#3091](https://github.com/LucasSantana-Dev/Lucky/issues/3091))',
                '- see [zz-notes](HTTPS://example.com/a_(b)) now',
            ].join('\n'),
        )
        const { container } = renderPage()
        const issue = await screen.findByRole('link', { name: '#3091' })
        expect(issue).toHaveAttribute(
            'href',
            'https://github.com/LucasSantana-Dev/Lucky/issues/3091',
        )
        expect(screen.getByRole('link', { name: 'zz-notes' })).toHaveAttribute(
            'href',
            'HTTPS://example.com/a_(b)',
        )
        expect(container.textContent).not.toMatch(/\]\(|\)\)/)
    })
})
