import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Landing from './Landing'
import { useAuthStore } from '@/stores/authStore'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import { useReducedMotion } from 'framer-motion'
import { api } from '@/services/api'

vi.mock('@/stores/authStore')
vi.mock('@/hooks/usePageMetadata')
vi.mock('framer-motion')
vi.mock('@/services/api')

const mockLogin = vi.fn()

function setupMocks(overrides?: {
    prefersReducedMotion?: boolean
    statsData?: { totalGuilds: number; totalUsers: number; uptimeSeconds: number; serversOnline: number }
}) {
    const {
        prefersReducedMotion = false,
        statsData = { totalGuilds: 100, totalUsers: 500, uptimeSeconds: 86400, serversOnline: 1 }
    } = overrides || {}

    vi.mocked(useAuthStore).mockImplementation(
        ((selector?: (value: unknown) => unknown) => {
            const state = { login: mockLogin }
            return selector ? selector(state) : state
        }) as typeof useAuthStore
    )

    vi.mocked(usePageMetadata).mockImplementation(() => undefined)
    vi.mocked(useReducedMotion).mockReturnValue(prefersReducedMotion)

    vi.mocked(api).stats = {
        getPublic: vi.fn().mockResolvedValue({ data: statsData })
    } as any
}

describe('Landing', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        setupMocks()
    })

    test('respects prefers-reduced-motion preference', () => {
        setupMocks({ prefersReducedMotion: true })

        render(<Landing />)

        const container = screen.getByText(/The all-in-one Discord bot for your community/i)
            .closest('.lucky-shell')

        expect(container).toBeInTheDocument()
    })

    test('renders hero section with headline and CTA buttons', () => {
        render(<Landing />)

        const headline = screen.getByRole('heading', {
            name: /The all-in-one Discord bot for your community/i,
        })
        expect(headline).toBeInTheDocument()

        const addToDiscordBtn = screen.getByRole('button', { name: /Add to Discord/i })
        const openDashboardBtn = screen.getByRole('button', { name: /Open Dashboard/i })

        expect(addToDiscordBtn).toBeInTheDocument()
        expect(openDashboardBtn).toBeInTheDocument()
    })

    test('displays hero subtitle', () => {
        render(<Landing />)

        expect(
            screen.getByText(
                /Music, moderation, custom commands, auto-mod, and a full web dashboard./i
            )
        ).toBeInTheDocument()
    })

    test('renders feature grid with 6 cards', () => {
        render(<Landing />)

        const features = [
            'Music',
            'Auto-mod',
            'Custom Commands',
            'Web Dashboard',
            'Embed Builder',
            'Artist Preferences',
        ]

        features.forEach(feature => {
            expect(screen.getByRole('heading', { name: feature })).toBeInTheDocument()
        })
    })

    test('renders stats strip with live data', async () => {
        render(<Landing />)

        // Wait for the stats labels to be rendered
        await waitFor(() => {
            expect(screen.getByText('Servers')).toBeInTheDocument()
            expect(screen.getByText('Users')).toBeInTheDocument()
            expect(screen.getByText('Status')).toBeInTheDocument()
        })

        // Check that the API was called
        expect(api.stats.getPublic).toHaveBeenCalled()
    })

    test('renders FAQ section with all questions and answers', () => {
        render(<Landing />)

        const faqs = [
            { q: 'Is Lucky free?', a: 'Yes, Lucky is completely free with no premium tier.' },
            { q: 'What commands does Lucky support?', a: 'Lucky supports 100+ commands across music, moderation, custom commands, and more.' },
            { q: 'How does autoplay work?', a: 'Autoplay uses Spotify to match similar songs based on artist preferences you set.' },
            { q: 'Can I self-host Lucky?', a: 'Lucky is hosted and managed by us. You cannot self-host the bot, but you can use the dashboard to configure it.' },
            { q: 'How do I moderate spam?', a: 'Configure auto-mod rules for spam, caps, links, and more in the dashboard.' },
            { q: 'Where do I get support?', a: 'Join our Discord support server or open an issue on GitHub.' },
        ]

        faqs.forEach(({ q, a }) => {
            expect(screen.getByText(q)).toBeInTheDocument()
            expect(screen.getByText(a)).toBeInTheDocument()
        })
    })

    test('FAQ accordion contains expandable details elements', () => {
        render(<Landing />)

        const faqSection = screen.getByText(/Frequently Asked Questions/)
        expect(faqSection).toBeInTheDocument()

        const firstQuestion = screen.getByText('Is Lucky free?')
        const detailsElement = firstQuestion.closest('details')

        expect(detailsElement).toBeInTheDocument()
        expect(detailsElement).toHaveClass('rounded-lg', 'border', 'border-lucky-border')

        const answer = screen.getByText('Yes, Lucky is completely free with no premium tier.')
        expect(answer).toBeInTheDocument()
    })

    test('renders footer with all link sections', () => {
        render(<Landing />)

        expect(screen.getByText('Lucky')).toBeInTheDocument()
        expect(screen.getByText('Links')).toBeInTheDocument()
        expect(screen.getByText('Support')).toBeInTheDocument()
    })

    test('renders Terms of Service link with correct href', () => {
        render(<Landing />)

        const termsLink = screen.getByRole('link', { name: /Terms of Service/i })
        expect(termsLink).toHaveAttribute('href', '/terms')
    })

    test('renders Privacy Policy link with correct href', () => {
        render(<Landing />)

        const privacyLink = screen.getByRole('link', { name: /Privacy Policy/i })
        expect(privacyLink).toHaveAttribute('href', '/privacy')
    })

    test('renders GitHub link with correct href and attributes', () => {
        render(<Landing />)

        const githubLink = screen.getByRole('link', { name: /GitHub/i })
        expect(githubLink).toHaveAttribute('href', 'https://github.com/LucasSantana-Dev/Lucky')
        expect(githubLink).toHaveAttribute('target', '_blank')
        expect(githubLink).toHaveAttribute('rel', 'noreferrer')
    })

    test('renders Add to Discord button with correct href when clicked', async () => {
        render(<Landing />)

        const addToDiscordBtn = screen.getByRole('button', { name: /Add to Discord/i })
        expect(addToDiscordBtn).toBeInTheDocument()

        vi.spyOn(window, 'open').mockReturnValue(null)

        const user = userEvent.setup()
        await user.click(addToDiscordBtn)

        await waitFor(() => {
            expect(window.open).toHaveBeenCalledWith(
                expect.stringContaining('discord.com/oauth2/authorize'),
                '_blank'
            )
        })
    })

    test('calls login when Open Dashboard button is clicked', async () => {
        render(<Landing />)

        const openDashboardBtn = screen.getByRole('button', { name: /Open Dashboard/i })

        const user = userEvent.setup()
        await user.click(openDashboardBtn)

        await waitFor(() => {
            expect(mockLogin).toHaveBeenCalled()
        })
    })

    test('sets page metadata on mount', () => {
        render(<Landing />)

        expect(usePageMetadata).toHaveBeenCalledWith({
            title: 'Lucky — Discord Bot with Music, Moderation & Dashboard',
            description: 'The all-in-one Discord bot for your community. Music, moderation, custom commands, auto-mod, and a full web dashboard. Free forever.',
        })
    })

    test('renders footer copyright text', () => {
        render(<Landing />)

        expect(screen.getByText(/© 2026 Lucky. All rights reserved./)).toBeInTheDocument()
    })

    test('renders feature descriptions correctly', () => {
        render(<Landing />)

        expect(
            screen.getByText(/Spotify-powered autoplay with genre matching/)
        ).toBeInTheDocument()

        expect(
            screen.getByText(/Spam\/caps\/link filters with per-guild rules/)
        ).toBeInTheDocument()

        expect(
            screen.getByText(/Full control from your browser/)
        ).toBeInTheDocument()
    })

    test('renders all footer columns with proper hierarchy', () => {
        render(<Landing />)

        const footerText = screen.getByText('Discord bot with music, moderation, and more.')
        expect(footerText).toBeInTheDocument()

        const needHelpText = screen.getByText(/Need help\? Join our Discord community\./)
        expect(needHelpText).toBeInTheDocument()
    })
})
