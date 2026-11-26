import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
    PermissionFlagsBits,
    type ChatInputCommandInteraction,
} from 'discord.js'
import { SUPPORT_SERVER_INVITE_URL } from '@lucky/shared/constants'
import { recordActivationEvent } from '@lucky/shared/services'
import { errorLog, getPrismaClient, infoLog } from '@lucky/shared/utils'
import { translatorForInteraction } from '../../i18n/translatorForInteraction'
import { buildFeedbackReportCustomId } from '../feedbackService'

const DAY_MS = 24 * 60 * 60 * 1000
/** A guild's admins are asked at most once in this window. */
export const ADMIN_PROMPT_COOLDOWN_MS = 30 * DAY_MS
/** Below this many plays the guild has not used Lucky enough to have a view. */
export const ADMIN_PROMPT_MIN_PLAYS = 5
/** Command name the feedback form records for answers that came from here. */
export const ADMIN_PROMPT_FEEDBACK_SOURCE = 'admin_prompt'

/** Commands whose successful use means "this admin is using the music". */
const TRIGGER_COMMANDS: ReadonlySet<string> = new Set([
    'play',
    'playtop',
    'playskip',
    'queue',
    'nowplaying',
])

// Guilds checked recently, so a busy guild costs one lookup per hour and not
// one per command. The database stays the record of who was asked.
const RECHECK_MS = 60 * 60 * 1000
const MAX_CHECKED = 2000
const checkedAt = new Map<string, number>()

/** Test helper: forget the in-memory recheck window. */
export function resetAdminFeedbackPromptState(): void {
    checkedAt.clear()
}

function recentlyChecked(guildId: string, now: number): boolean {
    const at = checkedAt.get(guildId)
    if (at !== undefined && now - at < RECHECK_MS) return true
    checkedAt.delete(guildId)
    checkedAt.set(guildId, now)
    if (checkedAt.size > MAX_CHECKED) {
        const oldest = checkedAt.keys().next()
        if (!oldest.done) checkedAt.delete(oldest.value)
    }
    return false
}

/**
 * Asks a server admin, ephemerally, what Lucky is missing. Lucky cannot DM
 * guild owners (decisions/2026-06-18-in-bot-growth.md), so this is how it
 * reaches the person who decides whether the bot stays: a reply only they
 * see, right after they used a music command, at most once every 30 days per
 * guild, and only in a guild that has played enough to have an opinion.
 *
 * Best effort: any failure is logged and swallowed so it can never break the
 * command that triggered it.
 */
export async function maybeAskAdminForFeedback(
    interaction: ChatInputCommandInteraction,
    now: Date = new Date(),
): Promise<boolean> {
    try {
        const guildId = interaction.guildId
        if (!guildId || !TRIGGER_COMMANDS.has(interaction.commandName)) {
            return false
        }
        if (
            !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
        ) {
            return false
        }
        // followUp needs an acknowledged interaction.
        if (!interaction.replied && !interaction.deferred) return false
        if (recentlyChecked(guildId, now.getTime())) return false

        const prisma = getPrismaClient()
        const asked = await prisma.activationEvent.findFirst({
            where: {
                guildDiscordId: guildId,
                kind: 'admin_feedback_prompt',
                occurredAt: {
                    gte: new Date(now.getTime() - ADMIN_PROMPT_COOLDOWN_MS),
                },
            },
            select: { id: true },
        })
        if (asked) return false

        const plays = await prisma.trackHistory.count({ where: { guildId } })
        if (plays < ADMIN_PROMPT_MIN_PLAYS) return false

        // Recorded first, like the first-play reminder: a failed write sends
        // nothing, and a failed send is not repeated.
        const recorded = await recordActivationEvent(
            guildId,
            'admin_feedback_prompt',
            interaction.commandName,
        )
        if (!recorded) return false

        const t = await translatorForInteraction(interaction)
        await interaction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle(t('music.adminPrompt.title'))
                    .setDescription(t('music.adminPrompt.description')),
            ],
            components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            buildFeedbackReportCustomId(
                                ADMIN_PROMPT_FEEDBACK_SOURCE,
                            ),
                        )
                        .setLabel(t('music.adminPrompt.feedbackButton'))
                        .setEmoji('💬')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setURL(SUPPORT_SERVER_INVITE_URL)
                        .setLabel(t('music.adminPrompt.supportButton'))
                        .setStyle(ButtonStyle.Link),
                ),
            ],
            flags: MessageFlags.Ephemeral,
        })
        infoLog({
            message: 'admin feedback prompt: sent',
            data: { guildId, command: interaction.commandName },
        })
        return true
    } catch (error) {
        errorLog({
            message: 'admin feedback prompt: failed',
            error,
            data: { guildId: interaction.guildId },
        })
        return false
    }
}
