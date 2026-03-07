import { Events, type Client, type Message } from 'discord.js'
import { autoModService } from '@lukbot/shared/services'
import { customCommandService } from '@lukbot/shared/services'
import { featureToggleService } from '@lukbot/shared/services'
import { errorLog, debugLog } from '@lukbot/shared/utils'

async function handleAutoMod(message: Message): Promise<void> {
    if (!message.guild || !message.member) return
    if (message.author.bot) return

    const isEnabled = await featureToggleService.isEnabled('AUTOMOD', {
        guildId: message.guild.id,
    })
    if (!isEnabled) return

    try {
        const guildId = message.guild.id
        const userId = message.author.id
        const memberRoles = message.member.roles.cache.map((r) => r.id)

        // Get automod settings to check if enabled
        const settings = await autoModService.getSettings(guildId)
        if (!settings) return

        // Check if this channel or user roles should be ignored
        const ignoredChannels = settings.exemptChannels ?? []
        const ignoredRoles = settings.exemptRoles ?? []
        const hasIgnoredRole = memberRoles.some((role) =>
            ignoredRoles.includes(role),
        )

        if (ignoredChannels.includes(message.channelId) || hasIgnoredRole) {
            return
        }

        // Run checks based on what's enabled
        const violations: Array<{
            type: string
            reason: string
            action: string
        }> = []

        if (settings.spamEnabled) {
            const isSpam = await autoModService.checkSpam(guildId, userId, [
                Date.now(),
            ])
            if (isSpam) {
                violations.push({
                    type: 'spam',
                    reason: 'Spam detected',
                    action: settings.spamAction,
                })
            }
        }

        if (settings.capsEnabled) {
            const isCaps = await autoModService.checkCaps(
                guildId,
                message.content,
            )
            if (isCaps) {
                violations.push({
                    type: 'caps',
                    reason: 'Excessive capitalization',
                    action: settings.capsAction,
                })
            }
        }

        if (settings.linksEnabled) {
            const hasLinks = await autoModService.checkLinks(
                guildId,
                message.content,
            )
            if (hasLinks) {
                violations.push({
                    type: 'links',
                    reason: 'Unauthorized link detected',
                    action: settings.linksAction,
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
                    action: settings.invitesAction,
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
                    action: settings.wordsAction,
                })
            }
        }

        // Process violations
        for (const violation of violations) {
            debugLog({
                message: `AutoMod violation in ${guildId}: ${violation.type}`,
                data: violation,
            })

            // Handle based on action type
            switch (violation.action) {
                case 'delete':
                    await message.delete().catch(() => {
                        // Message already deleted or permissions issue
                    })
                    break
                case 'warn':
                    // Would create a moderation case via ModerationService
                    break
                case 'mute':
                    // Would mute the user
                    break
                case 'kick':
                    await message.member
                        ?.kick(violation.reason)
                        .catch((err) => {
                            errorLog({
                                message:
                                    'Failed to kick user for automod violation:',
                                error: err,
                            })
                        })
                    break
                case 'ban':
                    await message.guild?.members
                        .ban(userId, { reason: violation.reason })
                        .catch((err) => {
                            errorLog({
                                message:
                                    'Failed to ban user for automod violation:',
                                error: err,
                            })
                        })
                    break
            }
        }
    } catch (error) {
        errorLog({
            message: 'Error running automod checks:',
            error,
        })
    }
}

async function handleCustomCommands(message: Message): Promise<void> {
    if (!message.guild || message.author.bot) return

    const isEnabled = await featureToggleService.isEnabled('CUSTOM_COMMANDS', {
        guildId: message.guild.id,
    })
    if (!isEnabled) return

    try {
        // Get all custom commands for the guild
        const commands = await customCommandService.listCommands(
            message.guild.id,
        )
        if (!commands || commands.length === 0) return

        // Check if message matches any custom command trigger
        const matchedCommand = commands.find((cmd: any) => {
            // Check exact match or prefix match
            return (
                message.content === cmd.trigger ||
                message.content.startsWith(cmd.trigger + ' ')
            )
        })

        if (!matchedCommand) return

        // Send response
        await message.reply({
            content: matchedCommand.response,
            allowedMentions: { repliedUser: false },
        })

        // Track usage
        await customCommandService.incrementUsage(
            message.guild.id,
            matchedCommand.name,
        )
    } catch (error) {
        errorLog({
            message: 'Error handling custom command:',
            error,
        })
    }
}

export function handleMessageCreate(client: Client): void {
    client.on(Events.MessageCreate, async (message: Message) => {
        try {
            await handleAutoMod(message)
            await handleCustomCommands(message)
        } catch (error) {
            errorLog({
                message: 'Error handling message:',
                error,
            })
        }
    })
}
