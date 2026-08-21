import type { ChatInputCommandInteraction } from 'discord.js'
import { createErrorEmbed } from '../general/embeds'
import { interactionReply } from '../general/interactionReply'
import { messages } from '../general/messages'

/**
 * Reply that nothing is currently playing.
 *
 * skip.ts and previous.ts each carried a byte-identical local
 * `handleNotPlaying`, both hardcoding the message string that already
 * existed as `messages.error.notPlaying` (#1970). One copy, one source
 * for the text.
 */
export async function replyNotPlaying(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    await interactionReply({
        interaction,
        content: {
            embeds: [createErrorEmbed('Error', messages.error.notPlaying)],
        },
    })
}
