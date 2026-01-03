/**
 * Voice channel validation following Single Responsibility Principle
 */

import type { GuildMember } from 'discord.js'
import type {
    CommandContext,
    CommandResult,
} from '../../../types/command/BaseCommand'
import { BaseValidator } from './BaseValidator'
import { VALIDATION_ERROR_CODES } from '../../../types/errors/validation'
import { errorEmbed } from '../../general/embeds'
import { messages } from '../../general/messages'
import { interactionReply } from '../../general/interactionReply'

export class VoiceChannelValidator extends BaseValidator {
    constructor() {
        super('VoiceChannelValidator')
    }

    async validate(context: CommandContext): Promise<CommandResult> {
        const member = context.interaction.member as GuildMember

        if (!member?.voice?.channel) {
            await interactionReply({
                interaction: context.interaction,
                content: {
                    embeds: [errorEmbed('Erro', messages.error.voiceChannel)],
                },
            })

            return this.createErrorResult(
                'User must be in a voice channel',
                VALIDATION_ERROR_CODES.VALIDATION_INVALID_INPUT,
            )
        }

        return this.createSuccessResult({
            voiceChannel: member.voice.channel,
            member,
        })
    }
}
