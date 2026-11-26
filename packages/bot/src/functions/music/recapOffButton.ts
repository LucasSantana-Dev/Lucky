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
import { TOP_GG_VOTE_URL } from '@lucky/shared/constants'
import { translatorForInteraction } from '../../i18n/translatorForInteraction'
import { disableRecap } from '../../services/recap/recapStore'
import { buildRecapMixButton } from './recapMixButton'
import { buildTrackedInviteUrl } from '../../utils/general/trackedInviteUrl'

/** Custom id of the "Turn off weekly recap" button on every recap (#2738). */
export const RECAP_OFF_BUTTON_ID = 'recap_off'

/**
 * Action row with "▶️ Play this week's mix", "🔕 Turn off", when a backend
 * is configured an "Add Lucky to your server" link, and a top.gg vote link.
 * The recap is the one message every member of an active guild sees each
 * week, so the links turn it into a referral surface: joins from it are
 * recorded as source `recap`, and votes lift Lucky in top.gg search.
 */
export function buildRecapOffRow(
    t: TFunction,
): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        buildRecapMixButton(t),
        new ButtonBuilder()
            .setCustomId(RECAP_OFF_BUTTON_ID)
            .setLabel(t('music.recap.offButton'))
            .setEmoji('🔕')
            .setStyle(ButtonStyle.Secondary),
    )
    const inviteUrl = buildTrackedInviteUrl('recap', 'card')
    if (inviteUrl) {
        row.addComponents(
            new ButtonBuilder()
                .setURL(inviteUrl)
                .setLabel(t('music.recap.inviteButton'))
                .setEmoji('➕')
                .setStyle(ButtonStyle.Link),
        )
    }
    row.addComponents(
        new ButtonBuilder()
            .setURL(TOP_GG_VOTE_URL)
            .setLabel(t('general.links.vote'))
            .setEmoji('💛')
            .setStyle(ButtonStyle.Link),
    )
    return row
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
    // Ack first: a cold-guild locale lookup and the DB call can each outlast
    // the 3s interaction window.
    await interaction.deferUpdate()
    const t = await translatorForInteraction(interaction)
    const reply = (content: string) =>
        interaction.followUp({ content, flags: MessageFlags.Ephemeral })

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await reply(t('music.recap.needManageGuild'))
        return
    }

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
