import type { Message, TextChannel } from 'discord.js'
import { levelService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'
import type {
    MessageContext,
    MessageHandler,
    MessageHandlerResult,
} from './types'

export const xpHandler: MessageHandler = {
    name: 'XP',

    async canHandle(
        message: Message,
        context: MessageContext,
    ): Promise<boolean> {
        return !message.author.bot
    },

    async handle(
        message: Message,
        context: MessageContext,
    ): Promise<MessageHandlerResult> {
        try {
            const guildId = context.guild.id
            const userId = message.author.id

            const config = await levelService.getConfig(guildId)
            if (!config || !config.enabled) {
                return { stop: false }
            }

            const current = await levelService.getMemberXP(guildId, userId)
            const now = Date.now()

            if (
                current &&
                now - current.lastXpAt.getTime() < config.xpCooldownMs
            ) {
                return { stop: false }
            }

            const result = await levelService.addXP(
                guildId,
                userId,
                config.xpPerMessage,
                message.member?.displayName ?? message.author.username,
            )

            if (result.leveledUp && config.announceChannel) {
                const rawChannel = await message.client.channels
                    .fetch(config.announceChannel)
                    .catch(() => null)
                if (rawChannel?.isTextBased()) {
                    await (rawChannel as TextChannel).send(
                        `🎉 ${message.author} reached level **${result.newLevel}**!`,
                    )
                }
                const rewards = await levelService.getRewards(guildId)
                const reward = rewards.find(
                    (r: { level: number }) => r.level === result.newLevel,
                )
                if (reward) {
                    await context.member.roles
                        .add(reward.roleId)
                        .catch(() => {})
                }
            }

            return { stop: false }
        } catch (error) {
            errorLog({
                message: 'Error handling XP:',
                error,
            })
            return { stop: false }
        }
    },
}
