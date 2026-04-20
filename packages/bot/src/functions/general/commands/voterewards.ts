import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders'
import { COLOR } from '@lucky/shared/constants'
import { infoLog, errorLog } from '@lucky/shared/utils'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'

const TOP_GG_BOT_ID = '962198089161134131'
const TOP_GG_VOTE_URL = `https://top.gg/bot/${TOP_GG_BOT_ID}/vote`

type VoteState = {
    hasVoted: boolean
    streak: number
    nextVoteInSeconds: number
}

type VoteTier = {
    threshold: number
    label: string
    perk: string
}

const TIERS: VoteTier[] = [
    {
        threshold: 30,
        label: 'Lucky Legend',
        perk: 'Dashboard badge + custom autoplay weighting + priority support',
    },
    {
        threshold: 14,
        label: 'Lucky Regular',
        perk: 'Custom autoplay weighting + early access to new commands',
    },
    {
        threshold: 7,
        label: 'Lucky Fan',
        perk: 'Early access to new commands',
    },
    { threshold: 1, label: 'Lucky Supporter', perk: 'Our thanks 💛' },
]

function tierFor(streak: number): VoteTier | null {
    for (const t of TIERS) {
        if (streak >= t.threshold) return t
    }
    return null
}

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
            { headers: { 'x-notify-key': key } },
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
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
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

        const tier = tierFor(state.streak)
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
