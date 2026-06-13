import {
    EmbedBuilder,
    type ChatInputCommandInteraction,
    PermissionFlagsBits,
} from 'discord.js'
import { moderationService } from '@lucky/shared/services'
import { getPrismaClient, infoLog } from '@lucky/shared/utils'
import { assertDefined } from '@lucky/shared/utils/guards'
import { interactionReply } from '../../../utils/general/interactionReply.js'
import { formatDurationHuman } from '../../../utils/general/formatDuration'

const prisma = getPrismaClient()

const typeColors: Record<string, number> = {
    warn: 0xffa500,
    mute: 0xff6b6b,
    unmute: 0x51cf66,
    kick: 0xff8787,
    ban: 0xc92a2a,
    unban: 0x51cf66,
    timeout: 0xff6b6b,
}

export async function handleCaseView(
    interaction: ChatInputCommandInteraction,
    caseNumber: number,
): Promise<void> {
    const moderationCase = await moderationService.getCase(
        assertDefined(interaction.guild, 'Guild required for handler').id,
        caseNumber,
    )
    if (!moderationCase) {
        await interactionReply({
            interaction,
            content: { content: `❌ Case #${caseNumber} not found.` },
        })
        return
    }

    const embed = new EmbedBuilder()
        .setColor(typeColors[moderationCase.type] || 0x5865f2)
        .setTitle(`📋 Case #${moderationCase.caseNumber}`)
        .addFields(
            {
                name: 'Type',
                value: moderationCase.type.toUpperCase(),
                inline: true,
            },
            {
                name: 'Status',
                value: moderationCase.active ? '🟢 Active' : '🔴 Inactive',
                inline: true,
            },
            {
                name: 'User',
                value: `${moderationCase.username} (${moderationCase.userId})`,
            },
            { name: 'Moderator', value: moderationCase.moderatorName },
            {
                name: 'Reason',
                value: moderationCase.reason || 'No reason provided',
            },
        )
        .setTimestamp(moderationCase.createdAt)

    if (moderationCase.duration) {
        embed.addFields({
            name: 'Duration',
            value: formatDurationHuman(moderationCase.duration),
            inline: true,
        })
    }
    if (moderationCase.expiresAt) {
        embed.addFields({
            name: 'Expires',
            value: `<t:${Math.floor(moderationCase.expiresAt.getTime() / 1000)}:R>`,
            inline: true,
        })
    }
    if (moderationCase.appealed) {
        embed.addFields(
            {
                name: 'Appeal Status',
                value: moderationCase.appealReviewed
                    ? moderationCase.appealApproved
                        ? '✅ Approved'
                        : '❌ Denied'
                    : '⏳ Pending',
            },
            {
                name: 'Appeal Reason',
                value: moderationCase.appealReason || 'N/A',
            },
        )
    }

    await interactionReply({ interaction, content: { embeds: [embed] } })
}

export async function handleCaseUpdate(
    interaction: ChatInputCommandInteraction,
    caseNumber: number,
): Promise<void> {
    const newReason = interaction.options.getString('reason', true)
    const moderationCase = await moderationService.getCase(
        assertDefined(interaction.guild, 'Guild required for handler').id,
        caseNumber,
    )
    if (!moderationCase) {
        await interactionReply({
            interaction,
            content: { content: `❌ Case #${caseNumber} not found.` },
        })
        return
    }

    await prisma.moderationCase.update({
        where: { id: moderationCase.id },
        data: { reason: newReason },
    })

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`✏️ Case #${caseNumber} Updated`)
        .addFields(
            {
                name: 'Old Reason',
                value: moderationCase.reason || 'No reason provided',
            },
            { name: 'New Reason', value: newReason },
            { name: 'Updated By', value: interaction.user.tag },
        )
        .setTimestamp()

    await interactionReply({ interaction, content: { embeds: [embed] } })
    infoLog({
        message: `Case #${caseNumber} updated by ${interaction.user.tag} in ${assertDefined(interaction.guild, 'Guild required for handler').name}`,
    })
}

export async function handleCaseDelete(
    interaction: ChatInputCommandInteraction,
    caseNumber: number,
): Promise<void> {
    const member = await assertDefined(interaction.guild, 'Guild required for handler').members.fetch(interaction.user.id)
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interactionReply({
            interaction,
            content: {
                content:
                    '❌ You need Administrator permission to delete cases.',
            },
        })
        return
    }

    const moderationCase = await moderationService.getCase(
        assertDefined(interaction.guild, 'Guild required for handler').id,
        caseNumber,
    )
    if (!moderationCase) {
        await interactionReply({
            interaction,
            content: { content: `❌ Case #${caseNumber} not found.` },
        })
        return
    }

    await moderationService.deactivateCase(moderationCase.id)

    const embed = new EmbedBuilder()
        .setColor(0xc92a2a)
        .setTitle(`🗑️ Case #${caseNumber} Deleted`)
        .addFields(
            { name: 'Type', value: moderationCase.type.toUpperCase() },
            { name: 'User', value: moderationCase.username },
            { name: 'Deleted By', value: interaction.user.tag },
        )
        .setTimestamp()

    await interactionReply({ interaction, content: { embeds: [embed] } })
    infoLog({
        message: `Case #${caseNumber} deleted by ${interaction.user.tag} in ${assertDefined(interaction.guild, 'Guild required for handler').name}`,
    })
}
