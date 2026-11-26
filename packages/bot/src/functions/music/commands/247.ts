import { SlashCommandBuilder } from '@discordjs/builders'
import {
    MessageFlags,
    PermissionFlagsBits,
    PermissionsBitField,
    type ChatInputCommandInteraction,
} from 'discord.js'
import { guildSettingsService } from '@lucky/shared/services'
import { errorLog, infoLog } from '@lucky/shared/utils'
import Command from '../../../models/Command'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { interactionReply } from '../../../utils/general/interactionReply'
import { requireGuild } from '../../../utils/command/commandValidations'
import { translatorForInteraction } from '../../../i18n/translatorForInteraction'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'
import { applyLeaveOptionsToQueue } from '../../../services/musicManagement/queueLeaveOptions'
import {
    clearIdleTimer,
    leaveIfIdle,
} from '../../../services/musicManagement/idleDisconnect'

/**
 * Manage Server check. `memberPermissions` can be missing on raw or uncached
 * guild interactions, so fall back to the member's own permissions (a
 * bitfield string on the raw API member).
 */
function canManageGuild(interaction: ChatInputCommandInteraction): boolean {
    if (interaction.memberPermissions) {
        return interaction.memberPermissions.has(
            PermissionFlagsBits.ManageGuild,
        )
    }
    const raw = interaction.member?.permissions
    if (raw === undefined || raw === null) return false
    const perms =
        typeof raw === 'string' ? new PermissionsBitField(BigInt(raw)) : raw
    return perms.has(PermissionFlagsBits.ManageGuild)
}

/**
 * 24/7 mode: Lucky stays in the voice channel when the queue ends or the
 * channel empties, instead of leaving. Playback still pauses in an empty
 * channel (discord-player's pauseOnEmpty), so it never streams to nobody.
 */
export default new Command({
    data: new SlashCommandBuilder()
        .setName('247')
        .setDescription(
            '🔁 Keep Lucky in the voice channel when the queue ends or everyone leaves',
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addBooleanOption((option) =>
            option
                .setName('enabled')
                .setDescription('Turn 24/7 mode on or off')
                .setRequired(true),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return
        const guildId = interaction.guildId
        if (!guildId) return
        // Acknowledge first: the settings write can outlast Discord's 3 s window.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const t = await translatorForInteraction(interaction)
        const reply = (content: string) =>
            interactionReply({
                interaction,
                content: { content, ephemeral: true },
            })

        // Default member permissions can be overridden per role, so check again.
        if (!canManageGuild(interaction)) {
            await reply(t('music.stayConnected.needManageGuild'))
            return
        }

        const enabled = interaction.options.getBoolean('enabled', true)
        try {
            const saved = await guildSettingsService.updateGuildSettings(
                guildId,
                { stayConnected: enabled },
            )
            if (!saved) {
                await reply(t('music.stayConnected.failed'))
                return
            }

            // A running queue reads these options live, so it follows the
            // toggle without a restart.
            const { queue } = resolveGuildQueue(client, guildId)
            if (queue && !queue.deleted) {
                applyLeaveOptionsToQueue(queue, enabled)
                // Turning 24/7 off: a queue that already ran dry (or sits in
                // an empty channel) will never see another end/empty event,
                // so leave now instead of staying connected forever.
                if (!enabled) leaveIfIdle(queue)
            }
            if (enabled) clearIdleTimer(guildId)

            infoLog({
                message: `24/7 mode turned ${enabled ? 'on' : 'off'}`,
                data: { guildId, liveQueue: Boolean(queue) },
            })
            await reply(
                t(
                    enabled
                        ? 'music.stayConnected.enabled'
                        : 'music.stayConnected.disabled',
                ),
            )
        } catch (error) {
            errorLog({ message: '247: command failed', error })
            await reply(t('music.stayConnected.failed'))
        }
    },
})
