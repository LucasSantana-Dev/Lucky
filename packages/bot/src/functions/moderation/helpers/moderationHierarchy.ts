import type {
    ChatInputCommandInteraction,
    Guild,
    GuildMember,
    Role,
} from 'discord.js'
import { interactionReply } from '../../../utils/general/interactionReply.js'

const UNKNOWN_MEMBER = 10007
const UNKNOWN_USER = 10013

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

/**
 * The member, or null only when Discord confirms they are not in the server.
 * Any other failure (rate limit, outage) is rethrown so the caller aborts
 * instead of treating the target as an unranked outsider.
 */
export async function fetchMemberOrNull(
    guild: Guild,
    userId: string,
): Promise<GuildMember | null> {
    try {
        return await guild.members.fetch(userId)
    } catch (error) {
        const code = (error as { code?: number })?.code
        if (code === UNKNOWN_MEMBER || code === UNKNOWN_USER) return null
        throw error
    }
}

/** Replies with the refusal and returns true when the moderator may not act. */
export async function refuseIfOutranked(
    interaction: ChatInputCommandInteraction,
    target: GuildMember | null,
): Promise<boolean> {
    const reason = await checkModerationHierarchy(interaction, target)
    if (!reason) return false
    await interactionReply({
        interaction,
        content: { content: `❌ ${reason}`, ephemeral: true },
    })
    return true
}

/**
 * Bulk variant of {@link checkModerationHierarchy}: a moderator may only run a
 * role-scoped bulk action (bulk kick, bulk role removal) on a role below their
 * own top role, otherwise they could reach members ranked above them through
 * the role. The owner may target any role. Returns the reason to refuse, or
 * null when the moderator may act.
 */
export async function checkRoleHierarchy(
    interaction: ChatInputCommandInteraction,
    role: Pick<Role, 'position'>,
): Promise<string | null> {
    if (interaction.user.id === interaction.guild?.ownerId) return null

    const invoker = await resolveInvoker(interaction)
    if (!invoker) {
        return "Couldn't verify your roles in this server. Try again."
    }
    if (role.position >= invoker.roles.highest.position) {
        return "You can't target a role equal to or higher than your highest role."
    }
    return null
}

/**
 * Highest role position a moderator outranks, for background jobs that run
 * after the interaction is gone: Infinity for the server owner, the
 * moderator's top role position otherwise (members at or above it are off
 * limits), or null when the moderator can no longer be resolved (left the
 * server), in which case the caller should refuse to act.
 */
export async function resolveModeratorCeiling(
    guild: Pick<Guild, 'ownerId' | 'members'>,
    moderatorId: string,
): Promise<number | null> {
    if (moderatorId === guild.ownerId) return Infinity
    const moderator = await guild.members.fetch(moderatorId).catch(() => null)
    return isRanked(moderator) ? moderator.roles.highest.position : null
}
