import { Events, type Client, type Message } from 'discord.js'
import { autoModService } from '@lucky/shared/services'
import { customCommandService } from '@lucky/shared/services'
import { featureToggleService } from '@lucky/shared/services'
import { moderationService } from '@lucky/shared/services'
import { errorLog, debugLog } from '@lucky/shared/utils'

const AUTOMOD_MUTE_DURATION = 300

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
                    action: 'delete',
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
                    action: 'delete',
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

        // Process violations
        for (const violation of violations) {
            debugLog({
                message: `AutoMod violation in ${guildId}: ${violation.type}`,
                data: violation,
            })

            await message.delete().catch(() => {})

            const caseInput = {
                guildId,
                userId,
                username: message.author.tag,
                moderatorId: message.client.user!.id,
                moderatorName: message.client.user!.tag,
                reason: `[AutoMod] ${violation.reason}`,
                channelId: message.channelId,
            }

            switch (violation.action) {
                case 'delete':
                    break
                case 'warn':
                    await moderationService
                        .createCase({ ...caseInput, type: 'warn' })
                        .catch((err) => {
                            errorLog({
                                message: 'Failed to create warn case:',
                                error: err,
                            })
                        })
                    break
                case 'mute':
                    await message.member
                        ?.timeout(
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
                    break
                case 'kick':
                    await message.member
                        ?.kick(caseInput.reason)
                        .catch((err) => {
                            errorLog({
                                message: 'Failed to kick user:',
                                error: err,
                            })
                        })
                    await moderationService
                        .createCase({ ...caseInput, type: 'kick' })
                        .catch((err) => {
                            errorLog({
                                message: 'Failed to create kick case:',
                                error: err,
                            })
                        })
                    break
                case 'ban':
                    await message.guild?.members
                        .ban(userId, { reason: caseInput.reason })
                        .catch((err) => {
                            errorLog({
                                message: 'Failed to ban user:',
                                error: err,
                            })
                        })
                    await moderationService
                        .createCase({ ...caseInput, type: 'ban' })
                        .catch((err) => {
                            errorLog({
                                message: 'Failed to create ban case:',
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
            content: matchedCommand.response ?? '',
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
