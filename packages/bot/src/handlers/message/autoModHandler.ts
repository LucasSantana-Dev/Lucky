import type { Message, GuildChannel } from 'discord.js'
import { PermissionFlagsBits } from 'discord.js'
import { autoModService } from '@lucky/shared/services'
import { errorLog, warnLog } from '@lucky/shared/utils'
import { assertDefined } from '@lucky/shared/utils/guards'
import type {
    MessageContext,
    MessageHandler,
    MessageHandlerResult,
} from './types'

interface Violation {
    type: string
    reason: string
}

/**
 * Whether the bot can delete messages in this channel — the only privileged
 * automod action currently wired. (mute/kick/ban cases are dead code; see #1505.)
 */
function botCanManageMessages(message: Message): boolean {
    const botMember = message.guild?.members.me
    if (!botMember) return false
    // Message deletion is channel-scoped; check the bot's perms in the channel.
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
                    })
                }
            }

            if (violations.length === 0) {
                return { stop: false }
            }

            // Check permission for message deletion before attempting
            if (!botCanManageMessages(message)) {
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
