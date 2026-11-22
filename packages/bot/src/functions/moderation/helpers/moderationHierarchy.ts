import type { ChatInputCommandInteraction, GuildMember } from 'discord.js'

type RankedMember = Pick<GuildMember, 'id'> & {
    roles: { highest: { position: number } }
}

function isRanked(member: unknown): member is RankedMember {
    const roles = (member as { roles?: { highest?: { position?: unknown } } })
        ?.roles
    return typeof roles?.highest?.position === 'number'
}

async function resolveInvoker(
    interaction: ChatInputCommandInteraction,
): Promise<RankedMember | null> {
    if (isRanked(interaction.member)) return interaction.member
    const fetched = await interaction.guild?.members
        .fetch(interaction.user.id)
        .catch(() => null)
    return isRanked(fetched) ? fetched : null
}

/**
 * Discord only checks the bot's role against the target, not the moderator's,
 * so without this a moderator could ban, kick or time out someone ranked above
 * them whenever the bot's role is higher. Returns the reason to refuse, or
 * null when the moderator may act. A target who is not in the server (ban by
 * id) has no roles and is allowed.
 */
export async function checkModerationHierarchy(
    interaction: ChatInputCommandInteraction,
    target: GuildMember | null,
): Promise<string | null> {
    if (!target) return null

    const guild = interaction.guild
    if (target.id === guild?.ownerId) {
        return "You can't moderate the server owner."
    }
    if (target.id === interaction.user.id) {
        return "You can't moderate yourself."
    }
    if (interaction.user.id === guild?.ownerId) return null

    const invoker = await resolveInvoker(interaction)
    if (!invoker) {
        return "Couldn't verify your roles in this server. Try again."
    }
    if (!isRanked(target)) {
        return "Couldn't verify the member's roles. Try again."
    }
    if (target.roles.highest.position >= invoker.roles.highest.position) {
        return "You can't moderate someone with an equal or higher role than yours."
    }
    return null
}
