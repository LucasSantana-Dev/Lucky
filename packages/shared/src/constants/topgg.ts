export const TOP_GG_BOT_ID = '962198089161134131'
export const TOP_GG_VOTE_URL = `https://top.gg/bot/${TOP_GG_BOT_ID}/vote`

export const TOP_GG_VOTE_TIERS = [
    { threshold: 30, label: 'Lucky Legend' },
    { threshold: 14, label: 'Lucky Regular' },
    { threshold: 7, label: 'Lucky Fan' },
    { threshold: 1, label: 'Lucky Supporter' },
] as const

export type TopggVoteTier = (typeof TOP_GG_VOTE_TIERS)[number]

export function tierForVoteStreak(streak: number): TopggVoteTier | null {
    for (const tier of TOP_GG_VOTE_TIERS) {
        if (streak >= tier.threshold) return tier
    }
    return null
}
