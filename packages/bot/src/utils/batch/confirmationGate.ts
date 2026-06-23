/**
 * Confirmation gate UI for batch operations.
 * Shows an ephemeral preview embed and await Proceed/Cancel buttons.
 */

import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    type BaseInteraction,
    type MessageComponentInteraction,
} from 'discord.js'
import { COLOR } from '@lucky/shared/constants'
import { errorLog, debugLog } from '@lucky/shared/utils'

export interface BatchConfirmationParams {
    /** Operation type (e.g., "channel move", "ban", "kick") */
    operation: string
    /** Total items affected by the operation */
    totalItems: number
    /** Estimated time in minutes */
    estimatedMinutes: number
    /** Array of fidelity warnings to display */
    fidelityWarnings?: string[]
}

/**
 * Shows a batch operation confirmation dialog with Proceed/Cancel buttons.
 * Waits for the invoker to click one of the buttons (5-minute timeout).
 * @param interaction The interaction to respond to (must be repliable).
 * @param params Batch operation details.
 * @returns True if user clicked Proceed, false if Cancel or timeout.
 */
export async function showBatchConfirmation(
    interaction: BaseInteraction,
    params: BatchConfirmationParams,
): Promise<boolean> {
    if (!interaction.isRepliable()) {
        errorLog({
            message:
                'showBatchConfirmation called with non-repliable interaction',
        })
        return false
    }

    try {
        const embed = buildConfirmationEmbed(params)
        const buttons = buildConfirmationButtons()

        const message = await interaction.reply({
            embeds: [embed],
            components: [buttons],
            ephemeral: true,
            fetchReply: true,
        })

        // Await button click from the invoker
        const response = await message.awaitMessageComponent({
            filter: (i: MessageComponentInteraction) =>
                i.user.id === interaction.user.id,
            time: 5 * 60 * 1000, // 5-minute timeout
        })

        const isProceed = response.customId === 'batch_proceed'

        // Update the interaction response to remove buttons
        await response.update({
            components: [],
        })

        return isProceed
    } catch (error) {
        debugLog({
            message: 'Batch confirmation timeout or error',
            error,
        })
        // Timeout or error → treat as cancel
        return false
    }
}

/**
 * Builds the confirmation embed with operation details.
 */
function buildConfirmationEmbed(params: BatchConfirmationParams): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(COLOR.LUCKY_PURPLE)
        .setTitle(`Confirm Batch ${params.operation}`)
        .addFields({
            name: 'Affected Items',
            value: params.totalItems.toString(),
            inline: true,
        })
        .addFields({
            name: 'Estimated Time',
            value: `~${params.estimatedMinutes} minute${params.estimatedMinutes !== 1 ? 's' : ''}`,
            inline: true,
        })

    if (params.fidelityWarnings && params.fidelityWarnings.length > 0) {
        const warnings = params.fidelityWarnings.map((w) => `• ${w}`).join('\n')
        embed.addFields({
            name: '⚠️ Warnings',
            value: warnings,
            inline: false,
        })
    }

    embed.setDescription(
        'This action will process items in the background. You can dismiss this confirmation and check progress later.',
    )

    return embed
}

/**
 * Builds the Proceed/Cancel button row.
 */
function buildConfirmationButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('batch_proceed')
            .setLabel('Proceed')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('batch_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger),
    )
}
