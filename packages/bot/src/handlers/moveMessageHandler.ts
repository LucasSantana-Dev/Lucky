import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    GuildPremiumTier,
    PermissionFlagsBits,
    type Attachment,
    type ChannelSelectMenuInteraction,
    type GuildTextBasedChannel,
    type Message,
    type User,
} from 'discord.js'
import { COLOR } from '@lucky/shared/constants'
import { errorLog, debugLog, captureException } from '@lucky/shared/utils'
import type { CustomClient } from '../types'
import { MOVE_MESSAGE_SELECT_PREFIX } from '../functions/moderation/contextMenus/moveMessage'

const ONE_MB = 1024 * 1024

/** Per-message upload ceiling by guild boost tier (Discord raised the base to 25MB). */
const UPLOAD_LIMIT_BY_TIER: Record<GuildPremiumTier, number> = {
    [GuildPremiumTier.None]: 25 * ONE_MB,
    [GuildPremiumTier.Tier1]: 25 * ONE_MB,
    [GuildPremiumTier.Tier2]: 50 * ONE_MB,
    [GuildPremiumTier.Tier3]: 100 * ONE_MB,
}

export const getUploadLimit = (tier: GuildPremiumTier): number =>
    UPLOAD_LIMIT_BY_TIER[tier] ?? UPLOAD_LIMIT_BY_TIER[GuildPremiumTier.None]

/**
 * Decode the source coordinates carried in the channel-select customId:
 * `movemsg:<sourceChannelId>:<messageId>`. Returns null if malformed.
 */
export const parseMoveCustomId = (
    customId: string,
): { sourceChannelId: string; messageId: string } | null => {
    if (!customId.startsWith(MOVE_MESSAGE_SELECT_PREFIX)) return null
    const [sourceChannelId, messageId] = customId
        .slice(MOVE_MESSAGE_SELECT_PREFIX.length)
        .split(':')
    if (!sourceChannelId || !messageId) return null
    return { sourceChannelId, messageId }
}

/**
 * Split a message's attachments into those that fit the destination's upload
 * limit and those that don't. Pure — the actual fetch happens separately.
 */
export const partitionAttachments = (
    attachments: Attachment[],
    uploadLimit: number,
): { toUpload: Attachment[]; tooLarge: Attachment[] } => {
    const toUpload: Attachment[] = []
    const tooLarge: Attachment[] = []
    for (const attachment of attachments) {
        if (attachment.size > uploadLimit) tooLarge.push(attachment)
        else toUpload.push(attachment)
    }
    return { toUpload, tooLarge }
}

/** Build the branded embed that preserves the original author + content. */
export const buildMoveEmbed = (params: {
    author: Pick<User, 'username'> & { displayAvatarURL: () => string }
    content: string
    createdAt: Date
    sourceChannelId: string
    moverTag: string
    tooLarge: Attachment[]
}): EmbedBuilder => {
    const { author, content, createdAt, sourceChannelId, moverTag, tooLarge } =
        params

    const embed = new EmbedBuilder()
        .setColor(COLOR.LUCKY_PURPLE)
        .setAuthor({
            name: author.username,
            iconURL: author.displayAvatarURL(),
        })
        .setDescription(content.length > 0 ? content : '*(no text content)*')
        .addFields({
            name: 'Originally posted in',
            value: `<#${sourceChannelId}>`,
            inline: true,
        })
        .setFooter({ text: `Moved by ${moverTag}` })
        .setTimestamp(createdAt)

    if (tooLarge.length > 0) {
        embed.addFields({
            name: '⚠️ Attachments too large to move',
            value: tooLarge
                .map((a) => `[${a.name}](${a.url})`)
                .join('\n')
                .slice(0, 1024),
        })
    }

    return embed
}

/** Fetch each attachment and wrap it as an uploadable file, preserving name + spoiler. */
const fetchAttachments = async (
    attachments: Attachment[],
): Promise<AttachmentBuilder[]> => {
    const files: AttachmentBuilder[] = []
    for (const attachment of attachments) {
        const response = await fetch(attachment.url)
        if (!response.ok) {
            throw new Error(
                `Failed to fetch attachment ${attachment.name}: ${response.status}`,
            )
        }
        const buffer = Buffer.from(await response.arrayBuffer())
        files.push(
            new AttachmentBuilder(buffer, {
                name: attachment.name,
                description: attachment.description ?? undefined,
            }).setSpoiler(attachment.spoiler),
        )
    }
    return files
}

const updateEphemeral = async (
    interaction: ChannelSelectMenuInteraction,
    content: string,
): Promise<void> => {
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content, components: [] })
    } else {
        await interaction.update({ content, components: [] })
    }
}

const missingPermNames = (
    channel: GuildTextBasedChannel,
    botMember: Parameters<GuildTextBasedChannel['permissionsFor']>[0],
    required: { flag: bigint; name: string }[],
): string[] => {
    const perms = channel.permissionsFor(botMember)
    return required.filter((r) => !perms?.has(r.flag)).map((r) => r.name)
}

export const handleMoveMessageSelect = async (
    interaction: ChannelSelectMenuInteraction,
    _client: CustomClient,
): Promise<void> => {
    const guild = interaction.guild
    const botMember = guild?.members.me
    if (!guild || !botMember) {
        await updateEphemeral(
            interaction,
            '❌ This action can only be used in a server.',
        )
        return
    }

    if (
        !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)
    ) {
        await updateEphemeral(
            interaction,
            'You need the **Manage Messages** permission to move messages.',
        )
        return
    }

    const parsed = parseMoveCustomId(interaction.customId)
    const destinationId = interaction.values[0]
    if (!parsed || !destinationId) {
        await updateEphemeral(
            interaction,
            '❌ Could not read the move request. Please try again.',
        )
        return
    }

    const { sourceChannelId, messageId } = parsed
    if (destinationId === sourceChannelId) {
        await updateEphemeral(
            interaction,
            '❌ Pick a destination different from the source channel.',
        )
        return
    }

    // From here the work is async (fetch/upload); acknowledge so the token
    // doesn't expire, then replace the picker with the outcome.
    await interaction.deferUpdate()

    try {
        const sourceChannel = await guild.channels
            .fetch(sourceChannelId)
            .catch(() => null)
        const destChannel = await guild.channels
            .fetch(destinationId)
            .catch(() => null)

        if (!sourceChannel?.isTextBased() || !destChannel?.isTextBased()) {
            await updateEphemeral(
                interaction,
                '❌ Source or destination channel is unavailable or not a text channel.',
            )
            return
        }

        const sourceMissing = missingPermNames(sourceChannel, botMember, [
            {
                flag: PermissionFlagsBits.ManageMessages,
                name: 'Manage Messages',
            },
        ])
        if (sourceMissing.length > 0) {
            await updateEphemeral(
                interaction,
                `❌ I can't delete the original — missing **${sourceMissing.join(', ')}** in <#${sourceChannelId}>.`,
            )
            return
        }

        const destMissing = missingPermNames(destChannel, botMember, [
            { flag: PermissionFlagsBits.ViewChannel, name: 'View Channel' },
            { flag: PermissionFlagsBits.SendMessages, name: 'Send Messages' },
            { flag: PermissionFlagsBits.EmbedLinks, name: 'Embed Links' },
            { flag: PermissionFlagsBits.AttachFiles, name: 'Attach Files' },
        ])
        if (destMissing.length > 0) {
            await updateEphemeral(
                interaction,
                `❌ I can't post in <#${destinationId}> — missing **${destMissing.join(', ')}**.`,
            )
            return
        }

        const message: Message | null = await sourceChannel.messages
            .fetch(messageId)
            .catch(() => null)
        if (!message) {
            await updateEphemeral(
                interaction,
                '❌ The original message no longer exists (already deleted?).',
            )
            return
        }

        const { toUpload, tooLarge } = partitionAttachments(
            [...message.attachments.values()],
            getUploadLimit(guild.premiumTier),
        )

        const embed = buildMoveEmbed({
            author: message.author,
            content: message.content,
            createdAt: message.createdAt,
            sourceChannelId,
            moverTag: interaction.user.tag,
            tooLarge,
        })

        const files = await fetchAttachments(toUpload)

        const moved = await destChannel.send({ embeds: [embed], files })

        // Only delete the original once the repost has succeeded.
        await message.delete()

        const linkRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('Jump to moved message')
                .setURL(moved.url),
        )

        await interaction.editReply({
            content: `✅ Moved to <#${destinationId}>.`,
            components: [linkRow],
        })
        debugLog({
            message: `Moved message ${messageId} from ${sourceChannelId} to ${destinationId}`,
        })
    } catch (error) {
        errorLog({ message: 'Failed to move message', error })
        captureException(
            error instanceof Error ? error : new Error(String(error)),
            { context: 'move-message-failure', guildId: guild.id },
        )
        await updateEphemeral(
            interaction,
            '❌ Something went wrong moving the message. The original was left untouched.',
        ).catch(() => undefined)
    }
}

export { MOVE_MESSAGE_SELECT_PREFIX }
