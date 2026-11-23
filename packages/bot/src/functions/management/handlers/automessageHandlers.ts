import { EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js'
import { autoMessageService, type MessageType } from '@lucky/shared/services'
import { infoLog } from '@lucky/shared/utils'
import { assertDefined } from '@lucky/shared/utils/guards'
import { interactionReply } from '../../../utils/general/interactionReply.js'

async function getMessageByType(guildId: string, type: MessageType) {
    if (type === 'welcome') return autoMessageService.getWelcomeMessage(guildId)
    if (type === 'leave') return autoMessageService.getLeaveMessage(guildId)
    return null
}

type ExistingMessage = { id: string; guildId: string }
type MessageUpdate = { enabled: boolean; message?: string; channelId?: string }

/**
 * Updates the stored message. When it was deleted in the meantime, tells the
 * user and returns false so no success embed is sent.
 */
async function updateExisting(
    interaction: ChatInputCommandInteraction,
    existing: ExistingMessage,
    data: MessageUpdate,
): Promise<boolean> {
    const updated = await autoMessageService.updateMessage(
        existing.guildId,
        existing.id,
        data,
    )
    if (updated) return true
    await interactionReply({
        interaction,
        content: {
            content:
                '❌ This message was removed while saving. Please run the command again.',
        },
    })
    return false
}

export async function handleAutoMessageConfig(
    interaction: ChatInputCommandInteraction,
    type: MessageType,
): Promise<void> {
    const enabled = interaction.options.getBoolean('enabled', true)
    const channel = interaction.options.getChannel('channel')
    const message = interaction.options.getString('message')

    if (enabled && !message && !channel) {
        const existing = await getMessageByType(
            assertDefined(interaction.guild, 'Guild required for handler').id,
            type,
        )
        if (!existing) {
            await interactionReply({
                interaction,
                content: {
                    content:
                        '❌ Please provide a channel and message to enable this feature.',
                },
            })
            return
        }
    }

    if (enabled && message && channel) {
        const existing = await getMessageByType(
            assertDefined(interaction.guild, 'Guild required for handler').id,
            type,
        )
        if (existing) {
            const saved = await updateExisting(interaction, existing, {
                enabled: true,
                message,
                channelId: channel.id,
            })
            if (!saved) return
        } else {
            await autoMessageService.createMessage(
                assertDefined(interaction.guild, 'Guild required for handler')
                    .id,
                type,
                { message },
                { channelId: channel.id },
            )
        }
    } else if (enabled && (message || channel)) {
        const existing = await getMessageByType(
            assertDefined(interaction.guild, 'Guild required for handler').id,
            type,
        )
        if (existing) {
            const saved = await updateExisting(interaction, existing, {
                enabled: true,
                ...(message && { message }),
                ...(channel && { channelId: channel.id }),
            })
            if (!saved) return
        } else {
            await interactionReply({
                interaction,
                content: {
                    content:
                        '❌ Please provide both channel and message for the first setup.',
                },
            })
            return
        }
    } else if (!enabled) {
        const existing = await getMessageByType(
            assertDefined(interaction.guild, 'Guild required for handler').id,
            type,
        )
        if (
            existing &&
            !(await updateExisting(interaction, existing, { enabled: false }))
        )
            return
    }

    const embed = new EmbedBuilder()
        .setColor(enabled ? 0x51cf66 : 0xc92a2a)
        .setTitle(
            `${enabled ? '✅' : '❌'} ${type === 'welcome' ? 'Welcome' : 'Leave'} Messages ${enabled ? 'Enabled' : 'Disabled'}`,
        )
        .setTimestamp()
    if (enabled && channel)
        embed.addFields({ name: 'Channel', value: `${channel}` })
    if (enabled && message)
        embed.addFields({
            name: 'Message',
            value:
                message.length > 100
                    ? message.substring(0, 97) + '...'
                    : message,
        })

    await interactionReply({ interaction, content: { embeds: [embed] } })
    infoLog({
        message: `${type} messages ${enabled ? 'enabled' : 'disabled'} by ${interaction.user.tag} in ${assertDefined(interaction.guild, 'Guild required for handler').name}`,
    })
}

export async function handleAutoMessageList(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    const welcomeMessages = await autoMessageService.getMessagesByType(
        assertDefined(interaction.guild, 'Guild required for handler').id,
        'welcome',
    )
    const leaveMessages = await autoMessageService.getMessagesByType(
        assertDefined(interaction.guild, 'Guild required for handler').id,
        'leave',
    )
    const allMessages = [...welcomeMessages, ...leaveMessages]

    if (allMessages.length === 0) {
        await interactionReply({
            interaction,
            content: { content: '📋 No auto-messages configured.' },
        })
        return
    }

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📋 Auto-Messages')
        .setDescription(
            allMessages
                .map(
                    (msg: {
                        enabled: boolean
                        type: string
                        channelId: string | null
                        message: string | null
                    }) => {
                        const status = msg.enabled ? '✅' : '❌'
                        const channel = msg.channelId
                            ? `<#${msg.channelId}>`
                            : 'Not set'
                        const text = msg.message || 'No message'
                        return `${status} **${msg.type.toUpperCase()}**\n└ Channel: ${channel}\n└ Message: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`
                    },
                )
                .join('\n\n'),
        )
        .setFooter({ text: `Total: ${allMessages.length} auto-messages` })
        .setTimestamp()

    await interactionReply({ interaction, content: { embeds: [embed] } })
}
