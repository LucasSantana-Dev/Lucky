import type { Message, PermissionResolvable, GuildChannel } from 'discord.js'
import { PermissionFlagsBits } from 'discord.js'
import { autoModService, moderationService } from '@lucky/shared/services'
import { errorLog, warnLog } from '@lucky/shared/utils'
import { assertDefined } from '@lucky/shared/utils/guards'
import type {
    MessageContext,
    MessageHandler,
    MessageHandlerResult,
} from './types'

const AUTOMOD_MUTE_DURATION = 300

interface Violation {
    type: string
    reason: string
    action: string
}

/**
 * Check if bot has a permission in the guild or channel context.
 * For channel-scoped perms (like ManageMessages), checks channel permissions.
 * For member-scoped perms (like ModerateMembers), checks guild permissions.
 */
function botHasPermission(
    message: Message,
    permission: PermissionResolvable,
): boolean {
    const botMember = message.guild?.members.me
    if (!botMember) return false

    // For message deletion, check channel-level permissions
    if (permission === PermissionFlagsBits.ManageMessages) {
        // Ensure channel is guild-based (has permissionsFor method)
        if (!('permissionsFor' in message.channel)) return false
        return (
            (message.channel as GuildChannel)
                .permissionsFor(
                    assertDefined(
                        message.client.user,
                        'Client user guaranteed when bot is ready',
                    ),
                )
                ?.has(PermissionFlagsBits.ManageMessages) ?? false
        )
    }

    // For member actions (timeout, kick, ban), check guild-level permissions
    return botMember.permissions.has(permission)
}

export const autoModHandler: MessageHandler = {
    name: 'AutoMod',

    async canHandle(
        message: Message,
        context: MessageContext,
    ): Promise<boolean> {
        return context.featureToggles['AUTOMOD'] === true && !message.author.bot
    },

    async handle(
        message: Message,
        context: MessageContext,
    ): Promise<MessageHandlerResult> {
        try {
            const guildId = context.guild.id
            const userId = message.author.id
            const memberRoles = context.member.roles.cache.map((r) => r.id)

            const settings = await autoModService.getSettings(guildId)
            if (!settings) return { stop: false }

            const ignoredChannels = settings.exemptChannels ?? []
            const ignoredRoles = settings.exemptRoles ?? []
            const hasIgnoredRole = memberRoles.some((role) =>
                ignoredRoles.includes(role),
            )

            if (ignoredChannels.includes(message.channelId) || hasIgnoredRole) {
                return { stop: false }
            }

            const violations: Violation[] = []

            if (settings.capsEnabled) {
                const isCaps = await autoModService.checkCaps(
                    guildId,
                    message.content,
                )
                if (isCaps) {
                    violations.push({
                        type: 'caps',
                        reason: 'Excessive capitalization',
                        action: 'delete',
                    })
                }
            }

            if (settings.linksEnabled) {
                const hasLinks = await autoModService.checkLinks(
                    guildId,
                    message.content,
                    message.channelId,
                )
                if (hasLinks) {
                    violations.push({
                        type: 'links',
                        reason: 'Unauthorized link detected',
                        action: 'delete',
                    })
                }
            }

            if (settings.invitesEnabled) {
                const hasInvites = await autoModService.checkInvites(
                    guildId,
                    message.content,
                )
                if (hasInvites) {
                    violations.push({
                        type: 'invites',
                        reason: 'Invite detected',
                        action: 'delete',
                    })
                }
            }

            if (settings.wordsEnabled) {
                const hasBadWords = await autoModService.checkWords(
                    guildId,
                    message.content,
                )
                if (hasBadWords) {
                    violations.push({
                        type: 'badwords',
                        reason: 'Inappropriate language detected',
                        action: 'delete',
                    })
                }
            }

            if (violations.length === 0) {
                return { stop: false }
            }

            // Check permission for message deletion before attempting
            if (
                !botHasPermission(message, PermissionFlagsBits.ManageMessages)
            ) {
                warnLog({
                    message: `[AutoMod] Skipped message delete: bot missing ManageMessages permission`,
                    data: {
                        guildId,
                        channelId: message.channelId,
                        violations: violations.map((v) => v.type),
                    },
                })
                // Don't delete the message, but continue processing actions
            } else {
                await message.delete().catch(() => {})
            }

            const clientUser = assertDefined(
                message.client.user,
                'Client user guaranteed when bot is ready',
            )
            const caseInput = {
                guildId,
                userId,
                username: message.author.tag,
                moderatorId: clientUser.id,
                moderatorName: clientUser.tag,
                reason: `[AutoMod] ${violations[0].reason}`,
                channelId: message.channelId,
            }

            for (const violation of violations) {
                switch (violation.action) {
                    case 'warn':
                        await moderationService
                            .createCase({
                                ...caseInput,
                                type: 'warn',
                            })
                            .catch((err) => {
                                errorLog({
                                    message: 'Failed to create warn case:',
                                    error: err,
                                })
                            })
                        break
                    case 'mute':
                        if (
                            !botHasPermission(
                                message,
                                PermissionFlagsBits.ModerateMembers,
                            )
                        ) {
                            warnLog({
                                message: `[AutoMod] Skipped mute action: bot missing ModerateMembers permission`,
                                data: {
                                    guildId,
                                    userId,
                                    violation: violation.type,
                                },
                            })
                        } else {
                            await context.member
                                .timeout(
                                    AUTOMOD_MUTE_DURATION * 1000,
                                    caseInput.reason,
                                )
                                .catch((err) => {
                                    errorLog({
                                        message: 'Failed to mute user:',
                                        error: err,
                                    })
                                })
                            await moderationService
                                .createCase({
                                    ...caseInput,
                                    type: 'mute',
                                    duration: AUTOMOD_MUTE_DURATION,
                                })
                                .catch((err) => {
                                    errorLog({
                                        message: 'Failed to create mute case:',
                                        error: err,
                                    })
                                })
                        }
                        break
                    case 'kick':
                        if (
                            !botHasPermission(
                                message,
                                PermissionFlagsBits.KickMembers,
                            )
                        ) {
                            warnLog({
                                message: `[AutoMod] Skipped kick action: bot missing KickMembers permission`,
                                data: {
                                    guildId,
                                    userId,
                                    violation: violation.type,
                                },
                            })
                        } else {
                            await context.member
                                .kick(caseInput.reason)
                                .catch((err) => {
                                    errorLog({
                                        message: 'Failed to kick user:',
                                        error: err,
                                    })
                                })
                            await moderationService
                                .createCase({
                                    ...caseInput,
                                    type: 'kick',
                                })
                                .catch((err) => {
                                    errorLog({
                                        message: 'Failed to create kick case:',
                                        error: err,
                                    })
                                })
                        }
                        break
                    case 'ban':
                        if (
                            !botHasPermission(
                                message,
                                PermissionFlagsBits.BanMembers,
                            )
                        ) {
                            warnLog({
                                message: `[AutoMod] Skipped ban action: bot missing BanMembers permission`,
                                data: {
                                    guildId,
                                    userId,
                                    violation: violation.type,
                                },
                            })
                        } else {
                            await context.guild.members
                                .ban(userId, { reason: caseInput.reason })
                                .catch((err) => {
                                    errorLog({
                                        message: 'Failed to ban user:',
                                        error: err,
                                    })
                                })
                            await moderationService
                                .createCase({
                                    ...caseInput,
                                    type: 'ban',
                                })
                                .catch((err) => {
                                    errorLog({
                                        message: 'Failed to create ban case:',
                                        error: err,
                                    })
                                })
                        }
                        break
                }
            }

            return { stop: true }
        } catch (error) {
            errorLog({
                message: 'Error running automod checks:',
                error,
            })
            return { stop: false }
        }
    },
}
