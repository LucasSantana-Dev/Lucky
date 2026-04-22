import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders'
import {
    COLOR,
    TOP_GG_VOTE_TIERS,
    TOP_GG_VOTE_URL,
    tierForVoteStreak,
    type TopggVoteTier,
} from '@lucky/shared/constants'
import { infoLog, errorLog } from '@lucky/shared/utils'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'

type VoteState = {
    hasVoted: boolean
    streak: number
    nextVoteInSeconds: number
}

type VoteTier = {
    threshold: TopggVoteTier['threshold']
    label: TopggVoteTier['label']
    perk: string
}

const PERKS_BY_THRESHOLD: Record<TopggVoteTier['threshold'], string> = {
    30: 'Dashboard badge + custom autoplay weighting + priority support',
    14: 'Custom autoplay weighting + early access to new commands',
    7: 'Early access to new commands',
    1: 'Our thanks 💛',
}

const TIERS: VoteTier[] = TOP_GG_VOTE_TIERS.map((tier) => ({
    ...tier,
    perk: PERKS_BY_THRESHOLD[tier.threshold],
}))

function getBackendOrigin(): string | null {
    const raw = process.env.WEBAPP_BACKEND_URL?.trim()
    if (!raw) return null
    try {
        const parsed = new URL(raw)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null
        }
        return parsed.origin
    } catch {
        return null
    }
}

async function fetchVoteState(userId: string): Promise<VoteState | null> {
    const origin = getBackendOrigin()
    const key = process.env.LUCKY_NOTIFY_API_KEY
    if (!origin || !key) return null
    try {
        const resp = await fetch(
            `${origin}/api/internal/votes/${encodeURIComponent(userId)}`,
            {
                headers: { 'x-notify-key': key },
                signal: AbortSignal.timeout(2500),
            },
        )
        if (!resp.ok) return null
        return (await resp.json()) as VoteState
    } catch (error) {
        errorLog({
            message: 'voterewards: failed to fetch vote state',
            data: { userId, error: String(error) },
        })
        return null
    }
}

function formatNextVoteIn(seconds: number): string {
    if (seconds <= 0) return 'now'
    let hours = Math.floor(seconds / 3600)
    let minutes = Math.ceil((seconds - hours * 3600) / 60)
    if (minutes === 60) {
        hours += 1
        minutes = 0
    }
    if (hours > 0) return `in ${hours}h ${minutes}m`
    return `in ${minutes}m`
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('voterewards')
        .setDescription(
            '💛 Check your Lucky vote streak and upcoming perks on top.gg.',
        ),
    category: 'general',
    execute: async ({ interaction }) => {
        infoLog({
            message: `voterewards requested by ${interaction.user.tag}`,
        })

        const state = await fetchVoteState(interaction.user.id)

        if (!state) {
            const embed = new EmbedBuilder()
                .setTitle('💛 Vote for Lucky on top.gg')
                .setColor(COLOR.LUCKY_PURPLE)
                .setDescription(
                    [
                        'Your vote streak unlocks perks — custom autoplay weighting, a dashboard badge, and more.',
                        '',
                        `[Vote on top.gg](${TOP_GG_VOTE_URL})`,
                    ].join('\n'),
                )
                .setFooter({
                    text: 'Vote tracking is offline right now — try again later.',
                })
            await interactionReply({
                interaction,
                content: { embeds: [embed.toJSON()] },
            })
            return
        }

        const tierBase = tierForVoteStreak(state.streak)
        const tier = tierBase
            ? { ...tierBase, perk: PERKS_BY_THRESHOLD[tierBase.threshold] }
            : null
        const voteLine = state.hasVoted
            ? `🗳️ You voted recently — next vote ${formatNextVoteIn(state.nextVoteInSeconds)}`
            : `🗳️ You can [vote now](${TOP_GG_VOTE_URL}) to start or extend your streak`
        const tierLine = tier
            ? `🏅 **${tier.label}** (${state.streak}-vote streak) — ${tier.perk}`
            : `Vote to unlock your first perk at streak **1**.`

        const embed = new EmbedBuilder()
            .setTitle('💛 Lucky Vote Rewards')
            .setColor(COLOR.LUCKY_PURPLE)
            .setDescription([voteLine, '', tierLine].join('\n'))
            .addFields(
                {
                    name: 'Current streak',
                    value: `${state.streak}`,
                    inline: true,
                },
                {
                    name: 'Next tier',
                    value: (() => {
                        const nextTier = [...TIERS]
                            .reverse()
                            .find((t) => t.threshold > state.streak)
                        return nextTier
                            ? `${nextTier.label} at ${nextTier.threshold}`
                            : 'Max tier reached'
                    })(),
                    inline: true,
                },
            )
            .setURL(TOP_GG_VOTE_URL)

        await interactionReply({
            interaction,
            content: { embeds: [embed.toJSON()] },
        })
    },
})
