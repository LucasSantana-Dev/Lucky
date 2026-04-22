import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VoteBadge } from './VoteBadge'
import { useVoteStatus } from '@/hooks/useVoteStatus'

vi.mock('@/hooks/useVoteStatus')

describe('VoteBadge', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('renders nothing while vote status is loading (null)', () => {
        vi.mocked(useVoteStatus).mockReturnValue({
            status: null,
        })

        const { container } = render(<VoteBadge />)
        expect(container.firstChild).toBeNull()
    })

    test('renders Vote CTA when user has no tier (zero streak)', () => {
        vi.mocked(useVoteStatus).mockReturnValue({
            status: {
                hasVoted: false,
                streak: 0,
                nextVoteInSeconds: 3600,
                tier: null,
                nextTier: { label: 'Lucky Supporter', threshold: 1 },
                voteUrl: 'https://top.gg/bot/abc/vote',
            },
        })

        render(<VoteBadge />)

        const link = screen.getByRole('link', {
            name: /vote/i,
        })
        expect(link).toBeInTheDocument()
        expect(link).toHaveAttribute('href', 'https://top.gg/bot/abc/vote')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noreferrer')
        expect(link).toHaveAttribute(
            'title',
            'Vote for Lucky on top.gg to unlock perks',
        )
        expect(screen.getByText('Vote')).toBeInTheDocument()
        expect(screen.getByText('🗳️')).toBeInTheDocument()
    })

    test('renders tier badge when user has Lucky Supporter tier', () => {
        vi.mocked(useVoteStatus).mockReturnValue({
            status: {
                hasVoted: true,
                streak: 1,
                nextVoteInSeconds: 0,
                tier: { label: 'Lucky Supporter', threshold: 1 },
                nextTier: { label: 'Lucky Fan', threshold: 7 },
                voteUrl: 'https://top.gg/bot/abc/vote',
            },
        })

        render(<VoteBadge />)

        const link = screen.getByRole('link')
        expect(link).toBeInTheDocument()
        expect(screen.getByText('Lucky Supporter')).toBeInTheDocument()
        expect(screen.getByText('💛')).toBeInTheDocument()
        expect(screen.getByText('· 1')).toBeInTheDocument()
    })

    test('renders tier badge when user has Lucky Fan tier', () => {
        vi.mocked(useVoteStatus).mockReturnValue({
            status: {
                hasVoted: true,
                streak: 7,
                nextVoteInSeconds: 0,
                tier: { label: 'Lucky Fan', threshold: 7 },
                nextTier: { label: 'Lucky Regular', threshold: 14 },
                voteUrl: 'https://top.gg/bot/abc/vote',
            },
        })

        render(<VoteBadge />)

        expect(screen.getByText('Lucky Fan')).toBeInTheDocument()
        expect(screen.getByText('· 7')).toBeInTheDocument()
    })

    test('renders tier badge when user has Lucky Regular tier', () => {
        vi.mocked(useVoteStatus).mockReturnValue({
            status: {
                hasVoted: true,
                streak: 14,
                nextVoteInSeconds: 0,
                tier: { label: 'Lucky Regular', threshold: 14 },
                nextTier: { label: 'Lucky Legend', threshold: 30 },
                voteUrl: 'https://top.gg/bot/abc/vote',
            },
        })

        render(<VoteBadge />)

        expect(screen.getByText('Lucky Regular')).toBeInTheDocument()
        expect(screen.getByText('· 14')).toBeInTheDocument()
    })

    test('renders tier badge when user has Lucky Legend tier', () => {
        vi.mocked(useVoteStatus).mockReturnValue({
            status: {
                hasVoted: true,
                streak: 30,
                nextVoteInSeconds: 0,
                tier: { label: 'Lucky Legend', threshold: 30 },
                nextTier: null,
                voteUrl: 'https://top.gg/bot/abc/vote',
            },
        })

        render(<VoteBadge />)

        expect(screen.getByText('Lucky Legend')).toBeInTheDocument()
        expect(screen.getByText('· 30')).toBeInTheDocument()
    })

    test('badge link has correct title with tier and streak info', () => {
        vi.mocked(useVoteStatus).mockReturnValue({
            status: {
                hasVoted: true,
                streak: 7,
                nextVoteInSeconds: 0,
                tier: { label: 'Lucky Fan', threshold: 7 },
                nextTier: { label: 'Lucky Regular', threshold: 14 },
                voteUrl: 'https://top.gg/bot/abc/vote',
            },
        })

        render(<VoteBadge />)

        const link = screen.getByRole('link')
        expect(link).toHaveAttribute(
            'title',
            'Lucky Fan — 7-vote streak. Click to vote again.',
        )
    })

    test('uses fallback styling for unknown tier', () => {
        vi.mocked(useVoteStatus).mockReturnValue({
            status: {
                hasVoted: true,
                streak: 5,
                nextVoteInSeconds: 0,
                tier: { label: 'Unknown Tier', threshold: 5 },
                nextTier: null,
                voteUrl: 'https://top.gg/bot/abc/vote',
            },
        })

        render(<VoteBadge />)

        const link = screen.getByRole('link')
        // Should use 'Lucky Supporter' fallback styling
        expect(link).toHaveClass('bg-lucky-bg-secondary')
        expect(screen.getByText('Unknown Tier')).toBeInTheDocument()
    })

    test('badge has correct accessibility classes and attributes', () => {
        vi.mocked(useVoteStatus).mockReturnValue({
            status: {
                hasVoted: true,
                streak: 7,
                nextVoteInSeconds: 0,
                tier: { label: 'Lucky Fan', threshold: 7 },
                nextTier: { label: 'Lucky Regular', threshold: 14 },
                voteUrl: 'https://top.gg/bot/abc/vote',
            },
        })

        render(<VoteBadge />)

        const link = screen.getByRole('link')
        expect(link).toHaveClass('lucky-focus-visible')
        // Emoji should have aria-hidden
        const emoji = screen.getByText('💛')
        expect(emoji).toHaveAttribute('aria-hidden', 'true')
    })

    test('vote CTA has correct accessibility attributes', () => {
        vi.mocked(useVoteStatus).mockReturnValue({
            status: {
                hasVoted: false,
                streak: 0,
                nextVoteInSeconds: 3600,
                tier: null,
                nextTier: { label: 'Lucky Supporter', threshold: 1 },
                voteUrl: 'https://top.gg/bot/abc/vote',
            },
        })

        render(<VoteBadge />)

        const link = screen.getByRole('link')
        expect(link).toHaveClass('lucky-focus-visible')
        const emoji = screen.getByText('🗳️')
        expect(emoji).toHaveAttribute('aria-hidden', 'true')
    })

    test('tier label is truncated with max-width constraint', () => {
        vi.mocked(useVoteStatus).mockReturnValue({
            status: {
                hasVoted: true,
                streak: 7,
                nextVoteInSeconds: 0,
                tier: { label: 'Lucky Fan', threshold: 7 },
                nextTier: { label: 'Lucky Regular', threshold: 14 },
                voteUrl: 'https://top.gg/bot/abc/vote',
            },
        })

        render(<VoteBadge />)

        const tierSpan = screen.getByText('Lucky Fan')
        expect(tierSpan).toHaveClass('truncate')
        expect(tierSpan).toHaveClass('max-w-[140px]')
    })

    test('links open in new tab with safe referrer policy', () => {
        vi.mocked(useVoteStatus).mockReturnValue({
            status: {
                hasVoted: true,
                streak: 7,
                nextVoteInSeconds: 0,
                tier: { label: 'Lucky Fan', threshold: 7 },
                nextTier: { label: 'Lucky Regular', threshold: 14 },
                voteUrl: 'https://top.gg/bot/abc/vote',
            },
        })

        render(<VoteBadge />)

        const link = screen.getByRole('link')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noreferrer')
    })
})
