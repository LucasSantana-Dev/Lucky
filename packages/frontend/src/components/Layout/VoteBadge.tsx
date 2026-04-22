import { useVoteStatus } from '@/hooks/useVoteStatus'

const TIER_STYLES: Record<string, string> = {
    'Lucky Supporter':
        'bg-lucky-bg-secondary text-lucky-text-secondary border-lucky-border',
    'Lucky Fan':
        'bg-lucky-bg-tertiary text-lucky-text-primary border-lucky-border-strong',
    'Lucky Regular':
        'bg-[color:var(--color-lucky-purple-muted,#2a1633)] text-lucky-text-primary border-[color:var(--color-lucky-purple,#9c27b0)]',
    'Lucky Legend':
        'bg-gradient-to-r from-amber-500/20 to-amber-500/40 text-amber-200 border-amber-500/60',
}

export function VoteBadge() {
    const { status } = useVoteStatus()

    // Hide until we have a loaded status. If the backend endpoint 404s
    // (not yet deployed) or the user has zero streak, render a subtle
    // "Vote" CTA instead of nothing.
    if (!status) return null

    if (!status.tier) {
        return (
            <a
                href={status.voteUrl}
                target='_blank'
                rel='noreferrer'
                className='lucky-focus-visible hidden sm:inline-flex items-center gap-1.5 rounded-md border border-lucky-border bg-lucky-bg-secondary px-2.5 py-1.5 type-body-sm text-lucky-text-secondary hover:border-lucky-border-strong hover:bg-lucky-bg-tertiary hover:text-lucky-text-primary transition-colors'
                title='Vote for Lucky on top.gg to unlock perks'
            >
                <span aria-hidden='true'>🗳️</span>
                <span>Vote</span>
            </a>
        )
    }

    const style =
        TIER_STYLES[status.tier.label] ?? TIER_STYLES['Lucky Supporter']

    return (
        <a
            href={status.voteUrl}
            target='_blank'
            rel='noreferrer'
            className={`lucky-focus-visible hidden sm:inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 type-body-sm transition-colors hover:brightness-110 ${style}`}
            title={`${status.tier.label} — ${status.streak}-vote streak. Click to vote again.`}
        >
            <span aria-hidden='true'>💛</span>
            <span className='truncate max-w-[140px]'>{status.tier.label}</span>
            <span className='type-meta opacity-70'>· {status.streak}</span>
        </a>
    )
}

export default VoteBadge
