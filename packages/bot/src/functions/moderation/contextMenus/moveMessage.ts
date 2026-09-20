import {
    ActionRowBuilder,
    ApplicationCommandType,
    ChannelSelectMenuBuilder,
    ChannelType,
    ContextMenuCommandBuilder,
    MessageFlags,
    PermissionFlagsBits,
} from 'discord.js'
import ContextMenuCommand from '../../../models/ContextMenuCommand'
import type { TContextMenuExecute } from '../../../types/CommandData'

/**
 * customId carried from the "Move message" context menu through to the
 * channel-select handler: `movemsg:<sourceChannelId>:<messageId>`. Snowflakes
 * never contain ':' so splitting is unambiguous. State lives entirely in the
 * customId — there is no server-side session.
 */
export const MOVE_MESSAGE_SELECT_PREFIX = 'movemsg:'

const DESTINATION_CHANNEL_TYPES = [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
] as const

const execute: TContextMenuExecute = async ({ interaction }) => {
    // setDefaultMemberPermissions hides the entry in the UI but is not
    // enforcement (admins can re-grant), so re-check at execution time.
    if (
        !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)
    ) {
        await interaction.reply({
            content:
                'You need the **Manage Messages** permission to move messages.',
            flags: MessageFlags.Ephemeral,
        })
        return
    }

    const targetMessage = interaction.targetMessage
    const customId = `${MOVE_MESSAGE_SELECT_PREFIX}${interaction.channelId}:${targetMessage.id}`

    const select = new ChannelSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder('Select the destination channel')
        .addChannelTypes(...DESTINATION_CHANNEL_TYPES)
        .setMinValues(1)
        .setMaxValues(1)

    const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        select,
    )

    await interaction.reply({
        content: `Where should I move this message? It will be reposted there and removed from <#${interaction.channelId}>.`,
        components: [row],
        flags: MessageFlags.Ephemeral,
    })
}

const moveMessage = new ContextMenuCommand({
    data: new ContextMenuCommandBuilder()
        .setName('Move message')
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    execute,
    category: 'moderation',
    botPermissions: [PermissionFlagsBits.ManageMessages],
})

export default moveMessage
