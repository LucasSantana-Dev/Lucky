import { describe, test, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import Landing from './Landing'
import { useAuthStore } from '@/stores/authStore'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { useReducedMotion } from 'framer-motion'
import { api } from '@/services/api'

vi.mock('@/stores/authStore')
vi.mock('@/hooks/usePageMetadata')
vi.mock('framer-motion', async () => {
    const React = await import('react')
    const passthrough = (tag: string) =>
        React.forwardRef(({ children, ...props }: any, ref: any) =>
            React.createElement(tag, { ...props, ref }, children),
        )
    return {
        motion: new Proxy({}, { get: (_t, prop: string) => passthrough(prop) }),
        AnimatePresence: ({ children }: any) => children,
        useReducedMotion: vi.fn(() => false),
    }
})
vi.mock('@/services/api')

const mockLogin = vi.fn()

type StatsFixture = {
    totalGuilds: number
    totalUsers: number
    uptimeSeconds: number
    serversOnline: number
}

function setupMocks(overrides?: {
    prefersReducedMotion?: boolean
    statsData?: StatsFixture
    statsError?: Error
}) {
    const {
        prefersReducedMotion = false,
        statsData = {
            totalGuilds: 240,
            totalUsers: 18_400,
            uptimeSeconds: 86_400,
            serversOnline: 1,
        },
        statsError,
    } = overrides || {}

    vi.mocked(useAuthStore).mockImplementation(((
        selector?: (value: unknown) => unknown,
    ) => {
        const state = { login: mockLogin }
        return selector ? selector(state) : state
    }) as typeof useAuthStore)

    vi.mocked(usePageMetadata).mockImplementation(() => undefined)
    vi.mocked(useReducedMotion).mockReturnValue(prefersReducedMotion)

    vi.mocked(api).stats = {
        getPublic: statsError
            ? vi.fn().mockRejectedValue(statsError)
            : vi.fn().mockResolvedValue({ data: statsData }),
    } as any
}

describe('Landing', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        setupMocks()
        // Mock the Discord client ID env var for tests
        ;(import.meta.env as Record<string, unknown>).VITE_DISCORD_CLIENT_ID =
            '962198089161134131'
    })

    test('sets page metadata on mount', () => {
        render(<Landing />)
        expect(usePageMetadata).toHaveBeenCalledWith({
            title: expect.stringMatching(/discord music bot/i),
            description: expect.stringMatching(/autoplay/i),
        })
    })

    test('renders top nav with brand wordmark and github link', () => {
        render(<Landing />)
        const wordmarks = screen.getAllByText('lucky')
        expect(wordmarks.length).toBeGreaterThanOrEqual(1)
        const githubLinks = screen.getAllByRole('link', { name: /github/i })
        expect(githubLinks.length).toBeGreaterThanOrEqual(1)
        expect(githubLinks[0]).toHaveAttribute(
            'href',
            'https://github.com/LucasSantana-Dev/Lucky',
        )
    })

    test('renders hero with cat logo, eyebrow and headline', () => {
        render(<Landing />)
        const logos = screen.getAllByAltText('Lucky')
        expect(logos.length).toBeGreaterThanOrEqual(2)
        const eyebrows = screen.getAllByText(/Open source/i)
        expect(eyebrows.length).toBeGreaterThanOrEqual(1)
        expect(
            screen.getByText(/A Discord bot built right\./i),
        ).toBeInTheDocument()
        expect(screen.getByText(/And yours to run\./i)).toBeInTheDocument()
    })

    test('renders Add to Discord primary CTA in hero and nav when invite URL is set', () => {
        render(<Landing />)
        const inviteLinks = screen.getAllByRole('link', {
            name: /Add to Discord/i,
        })
        expect(inviteLinks.length).toBeGreaterThanOrEqual(2)
        inviteLinks.forEach((link) => {
            expect(link).toHaveAttribute(
                'href',
                expect.stringContaining('discord.com/oauth2/authorize'),
            )
            expect(link).toHaveAttribute('target', '_blank')
            expect(link).toHaveAttribute('rel', 'noopener noreferrer')
        })
    })

    test('falls back to the public default client id when env var not set', () => {
        const originalEnv = { ...import.meta.env }
        ;(import.meta.env as Record<string, unknown>).VITE_DISCORD_CLIENT_ID =
            ''
        try {
            render(<Landing />)
            // With no env override, the CTA stays enabled and links to the
            // bundled public Application ID — no operator config required.
            const inviteLinks = screen.getAllByRole('link', {
                name: /Add to Discord/i,
            })
            expect(inviteLinks.length).toBeGreaterThanOrEqual(2)
            inviteLinks.forEach((link) => {
                expect(link).toHaveAttribute(
                    'href',
                    expect.stringContaining('client_id=962198089161134131'),
                )
            })
        } finally {
            Object.assign(import.meta.env, originalEnv)
        }
    })

    test('renders Self-host on GitHub secondary CTA in hero', () => {
        render(<Landing />)
        const selfHost = screen.getByRole('link', {
            name: /Self-host on GitHub/i,
        })
        expect(selfHost).toHaveAttribute(
            'href',
            'https://github.com/LucasSantana-Dev/Lucky',
        )
        expect(selfHost).toHaveAttribute('target', '_blank')
    })

    test('dashboard nav button triggers login', () => {
        render(<Landing />)
        fireEvent.click(screen.getByRole('button', { name: /dashboard/i }))
        expect(mockLogin).toHaveBeenCalled()
    })

    test('renders repo card with name, license and language', async () => {
        render(<Landing />)
        expect(screen.getByText('LucasSantana-Dev / Lucky')).toBeInTheDocument()
        expect(screen.getByText('ISC')).toBeInTheDocument()
        expect(screen.getByText('TypeScript')).toBeInTheDocument()
        await waitFor(() => {
            expect(screen.getByText('servers')).toBeInTheDocument()
            expect(screen.getByText('users')).toBeInTheDocument()
        })
    })

    test('repo card fetches and displays stats from api', async () => {
        render(<Landing />)
        await waitFor(() => expect(api.stats.getPublic).toHaveBeenCalled())
        await waitFor(() => expect(screen.getByText('240')).toBeInTheDocument())
    })

    test('repo card shows ellipsis while stats loading', () => {
        setupMocks()
        vi.mocked(api).stats = {
            getPublic: vi.fn(() => new Promise(() => {})),
        } as any
        render(<Landing />)
        const ellipses = screen.getAllByText('…')
        expect(ellipses.length).toBeGreaterThanOrEqual(2)
    })

    test('renders features section with five user-facing items', () => {
        render(<Landing />)
        expect(
            screen.getByText(/Music with smart autoplay/i),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/Moderation that doesn't sleep/i),
        ).toBeInTheDocument()
        expect(
            screen.getAllByText(/Custom commands/i).length,
        ).toBeGreaterThanOrEqual(1)
        expect(screen.getByText(/A real web dashboard/i)).toBeInTheDocument()
        expect(screen.getByText(/Embed builder/i)).toBeInTheDocument()
    })

    test('repo card copy button writes clone command to clipboard', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
            writable: true,
        })

        render(<Landing />)
        const copyBtn = screen.getByRole('button', { name: /Copy clone URL/i })
        fireEvent.click(copyBtn)

        await waitFor(() =>
            expect(writeText).toHaveBeenCalledWith(
                'git clone https://github.com/LucasSantana-Dev/Lucky.git',
            ),
        )
    })

    test('repo card handles clipboard failure gracefully', async () => {
        const errorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)
        const writeText = vi.fn().mockRejectedValue(new Error('denied'))
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
            writable: true,
        })

        try {
            render(<Landing />)
            const copyBtn = screen.getByRole('button', {
                name: /Copy clone URL/i,
            })
            fireEvent.click(copyBtn)
            await waitFor(() => expect(errorSpy).toHaveBeenCalled())
        } finally {
            errorSpy.mockRestore()
        }
    })

    test('renders why-self-host section with three reason cards', () => {
        render(<Landing />)
        expect(
            screen.getByText('Your guild data stays yours'),
        ).toBeInTheDocument()
        expect(screen.getByText('Fork the source')).toBeInTheDocument()
        expect(
            screen.getByText('Free, with no premium tier'),
        ).toBeInTheDocument()
    })

    test('renders command list with all six commands and category tags', () => {
        render(<Landing />)
        expect(screen.getByText('/play')).toBeInTheDocument()
        expect(screen.getByText('/autoplay')).toBeInTheDocument()
        expect(screen.getByText('/queue')).toBeInTheDocument()
        expect(screen.getByText('/mod ban')).toBeInTheDocument()
        expect(screen.getByText('/automod')).toBeInTheDocument()
        expect(screen.getByText('/cc create')).toBeInTheDocument()
        expect(screen.getAllByText(/music/i).length).toBeGreaterThanOrEqual(2)
        expect(screen.getAllByText(/mod$/i).length).toBeGreaterThanOrEqual(1)
        expect(
            screen.getByText('+ 100 more in the dashboard'),
        ).toBeInTheDocument()
    })

    test('renders stack list with all six services', () => {
        render(<Landing />)
        expect(screen.getByText('lucky-bot')).toBeInTheDocument()
        expect(screen.getByText('lucky-backend')).toBeInTheDocument()
        expect(screen.getByText('lucky-frontend')).toBeInTheDocument()
        expect(screen.getByText('postgres')).toBeInTheDocument()
        expect(screen.getByText('redis')).toBeInTheDocument()
        expect(screen.getByText('nginx')).toBeInTheDocument()
    })

    test('renders repo footer banner and footer copyright', () => {
        render(<Landing />)
        expect(screen.getByText(/Open source under ISC/i)).toBeInTheDocument()
        expect(screen.getByText(/© 2026 Lucky\. ISC\./)).toBeInTheDocument()
    })

    test('renders footer with Terms, Privacy and Discord support links', () => {
        render(<Landing />)
        expect(screen.getByRole('link', { name: /Terms/i })).toHaveAttribute(
            'href',
            '/terms',
        )
        expect(screen.getByRole('link', { name: /Privacy/i })).toHaveAttribute(
            'href',
            '/privacy',
        )
        const supportLink = screen.getByRole('link', {
            name: /Support server/i,
        })
        expect(supportLink).toHaveAttribute('target', '_blank')
        expect(supportLink).toHaveAttribute('rel', 'noreferrer')
    })

    test('logs and recovers when stats fetch rejects', async () => {
        const errorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)
        try {
            setupMocks({ statsError: new Error('boom') })
            render(<Landing />)
            await waitFor(() => expect(errorSpy).toHaveBeenCalled())
        } finally {
            errorSpy.mockRestore()
        }
    })

    test('respects prefers-reduced-motion', () => {
        setupMocks({ prefersReducedMotion: true })
        render(<Landing />)
        expect(
            screen.getByText(/A Discord bot built right\./i),
        ).toBeInTheDocument()
    })

    test('shows zero stats correctly when api returns zeros', async () => {
        setupMocks({
            statsData: {
                totalGuilds: 0,
                totalUsers: 0,
                uptimeSeconds: 0,
                serversOnline: 0,
            },
        })
        render(<Landing />)
        await waitFor(() => expect(api.stats.getPublic).toHaveBeenCalled())
        const zeros = await screen.findAllByText('0')
        // Two honest stat columns (servers/users): both come straight from the
        // API, so totalGuilds=0 + totalUsers=0 → both render '0'.
        expect(zeros.length).toBeGreaterThanOrEqual(2)
    })

    test('repo card shows an em-dash fallback when the stats fetch fails', async () => {
        setupMocks({ statsError: new Error('stats unavailable') })
        render(<Landing />)
        await waitFor(() => expect(api.stats.getPublic).toHaveBeenCalled())
        // No stale 0 / placeholder — unavailable stats render as '—'.
        const dashes = await screen.findAllByText('—')
        expect(dashes.length).toBeGreaterThanOrEqual(2)
    })
})
