import {
    Events,
    type Client,
    type GuildMember,
    type PartialGuildMember,
    ChannelType,
    EmbedBuilder,
} from 'discord.js'
import { autoMessageService } from '@lukbot/shared/services'
import { errorLog, debugLog } from '@lukbot/shared/utils'

async function handleMemberAdd(member: GuildMember): Promise<void> {
    if (!member.guild) return

    try {
        // Get welcome message for this guild
        const welcomeMessage = await autoMessageService.getWelcomeMessage(
            member.guild.id,
        )
        if (!welcomeMessage || !welcomeMessage.enabled) return

        // Find welcome channel - prioritize specified channel, then default channel
        let targetChannel = null

        if (welcomeMessage.channelId) {
            targetChannel = member.guild.channels.cache.get(
                welcomeMessage.channelId,
            )
        }

        // Fallback to system channel or first text channel
        if (!targetChannel) {
            targetChannel = member.guild.systemChannel
        }

        if (!targetChannel) {
            targetChannel = member.guild.channels.cache.find(
                (ch) => ch.type === ChannelType.GuildText,
            )
        }

        if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
            debugLog({
                message: `No suitable channel found for welcome message in ${member.guild.id}`,
            })
            return
        }

        // Prepare message content
        const content = welcomeMessage.message
            .replace(/{user}/g, member.user.username)
            .replace(/{mention}/g, member.toString())
            .replace(/{guild}/g, member.guild.name)
            .replace(/{count}/g, member.guild.memberCount.toString())

        // Send message
        if (welcomeMessage.embedData) {
            try {
                const embedData = JSON.parse(welcomeMessage.embedData)
                const embed = new EmbedBuilder()
                    .setTitle(embedData.title || undefined)
                    .setDescription(content)

                if (embedData.color) {
                    embed.setColor(
                        parseInt(embedData.color.replace('#', ''), 16),
                    )
                }

                await targetChannel.send({ embeds: [embed] })
            } catch (err) {
                // Fallback to text message if embed parsing fails
                await targetChannel.send(content)
            }
        } else {
            await targetChannel.send(content)
        }

        debugLog({
            message: `Sent welcome message to ${member.user.tag} in ${member.guild.name}`,
        })
    } catch (error) {
        errorLog({
            message: 'Error handling member add:',
            error,
        })
    }
}

async function handleMemberRemove(
    member: GuildMember | PartialGuildMember,
): Promise<void> {
    if (!member.guild) return

    try {
        // Get leave message for this guild
        const leaveMessage = await autoMessageService.getLeaveMessage(
            member.guild.id,
        )
        if (!leaveMessage || !leaveMessage.enabled) return

        // Find target channel - use specified channel or system channel
        let targetChannel = null

        if (leaveMessage.channelId) {
            targetChannel = member.guild.channels.cache.get(
                leaveMessage.channelId,
            )
        }

        if (!targetChannel) {
            targetChannel = member.guild.systemChannel
        }

        if (!targetChannel) {
            targetChannel = member.guild.channels.cache.find(
                (ch) => ch.type === ChannelType.GuildText,
            )
        }

        if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
            debugLog({
                message: `No suitable channel found for leave message in ${member.guild.id}`,
            })
            return
        }

        // Prepare message content
        const content = leaveMessage.message
            .replace(/{user}/g, member.user.username)
            .replace(/{mention}/g, member.toString())
            .replace(/{guild}/g, member.guild.name)
            .replace(/{count}/g, member.guild.memberCount.toString())

        // Send message
        if (leaveMessage.embedData) {
            try {
                const embedData = JSON.parse(leaveMessage.embedData)
                const embed = new EmbedBuilder()
                    .setTitle(embedData.title || undefined)
                    .setDescription(content)

                if (embedData.color) {
                    embed.setColor(
                        parseInt(embedData.color.replace('#', ''), 16),
                    )
                }

                await targetChannel.send({ embeds: [embed] })
            } catch (err) {
                // Fallback to text message if embed parsing fails
                await targetChannel.send(content)
            }
        } else {
            await targetChannel.send(content)
        }

        debugLog({
            message: `Sent leave message for ${member.user.tag} in ${member.guild.name}`,
        })
    } catch (error) {
        errorLog({
            message: 'Error handling member remove:',
            error,
        })
    }
}

export function handleMemberEvents(client: Client): void {
    client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
        try {
            await handleMemberAdd(member)
        } catch (error) {
            errorLog({
                message: 'Error in member add handler:',
                error,
            })
        }
    })

    client.on(
        Events.GuildMemberRemove,
        async (member: GuildMember | PartialGuildMember) => {
            try {
                await handleMemberRemove(member)
            } catch (error) {
                errorLog({
                    message: 'Error in member remove handler:',
                    error,
                })
            }
        },
    )
}
