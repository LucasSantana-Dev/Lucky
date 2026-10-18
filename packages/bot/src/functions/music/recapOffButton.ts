import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    PermissionFlagsBits,
    type ButtonInteraction,
} from 'discord.js'
import type { TFunction } from 'i18next'
import { errorLog, infoLog } from '@lucky/shared/utils'
import { translatorForInteraction } from '../../i18n/translatorForInteraction'
import { disableRecap } from '../../services/recap/recapStore'

/** Custom id of the "Turn off weekly recap" button on every recap (#2738). */
export const RECAP_OFF_BUTTON_ID = 'recap_off'

export function buildRecapOffRow(
    t: TFunction,
): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(RECAP_OFF_BUTTON_ID)
            .setLabel(t('music.recap.offButton'))
            .setEmoji('🔕')
            .setStyle(ButtonStyle.Secondary),
    )
}

/**
 * Same rule as /recap off: only Manage Server may turn the recap off. The
 * card is public, so anyone else gets an ephemeral refusal and the button
 * stays. The off is guild-wide, even from a card in an older channel.
 */
export async function handleRecapOffButton(
    interaction: ButtonInteraction,
): Promise<void> {
    const guildId = interaction.guildId
    if (!guildId) return
    const t = await translatorForInteraction(interaction)
    const reply = (content: string) =>
        interaction.followUp({ content, flags: MessageFlags.Ephemeral })

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
            content: t('music.recap.needManageGuild'),
            flags: MessageFlags.Ephemeral,
        })
        return
    }

    // Ack before the DB call so the 3s interaction window can't expire.
    await interaction.deferUpdate()
    try {
        const wasOn = await disableRecap(guildId)
        if (wasOn) {
            infoLog({
                message: 'recap: disabled from the card',
                data: { guildId },
            })
        }
        await interaction.editReply({ components: [] })
        await reply(
            t(wasOn ? 'music.recap.disabled' : 'music.recap.alreadyOff'),
        )
    } catch (error) {
        errorLog({
            message: 'recap: off button failed',
            error,
            data: { guildId },
        })
        await reply(t('music.recap.failed'))
    }
}
