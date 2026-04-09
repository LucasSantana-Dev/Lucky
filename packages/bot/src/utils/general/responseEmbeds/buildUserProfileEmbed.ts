import { EmbedBuilder } from 'discord.js'
import type { User } from 'discord.js'

const PROFILE_COLOR = 0x5865f2

export type UserStats = {
    xp?: number
    level?: number
    rank?: number
    xpForNextLevel?: number
}

function createProgressBar(
    current: number,
    max: number,
    length: number = 10,
): string {
    if (max === 0) return '█'.repeat(length)

    const ratio = Math.min(current / max, 1)
    const filled = Math.round(ratio * length)
    const empty = length - filled

    return '█'.repeat(filled) + '░'.repeat(empty)
}

export function buildUserProfileEmbed(
    user: Pick<User, 'username' | 'displayAvatarURL'> & { tag?: string },
    stats?: UserStats,
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setAuthor({
            name: user.tag || user.username,
            iconURL: user.displayAvatarURL({ size: 64 }),
        })
        .setColor(PROFILE_COLOR)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setTimestamp()

    if (!stats || Object.keys(stats).length === 0) {
        embed.setDescription('No stats available.')
        return embed
    }

    const fields: { name: string; value: string; inline: boolean }[] = []

    if (typeof stats.level === 'number') {
        fields.push({ name: 'Level', value: String(stats.level), inline: true })
    }

    if (typeof stats.rank === 'number') {
        fields.push({ name: 'Rank', value: `#${stats.rank}`, inline: true })
    }

    if (typeof stats.xp === 'number') {
        if (typeof stats.xpForNextLevel === 'number') {
            const progress = createProgressBar(stats.xp, stats.xpForNextLevel)
            fields.push({
                name: 'XP Progress',
                value: `${progress} ${stats.xp} / ${stats.xpForNextLevel}`,
                inline: false,
            })
        } else {
            fields.push({
                name: 'Total XP',
                value: String(stats.xp),
                inline: true,
            })
        }
    }

    embed.addFields(fields)
    return embed
}
