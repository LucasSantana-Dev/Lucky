import { Events, type Client, type Message } from 'discord.js'
import { featureToggleService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'
import { MessagePipeline } from './message/pipeline'
import { spamHandler } from '../functions/automod/handlers/spamHandler'
import { afkHandler } from './message/afkHandler'
import { xpHandler } from './message/xpHandler'
import type { MessageContext } from './message/types'

const pipeline = new MessagePipeline()
    .register(spamHandler)
    .register(afkHandler)
    .register(xpHandler)

export function handleMessageCreate(client: Client): void {
    client.on(Events.MessageCreate, async (message: Message) => {
        try {
            if (!message.guild || !message.member) return

            const automod = await featureToggleService
                .isEnabled('AUTOMOD', { guildId: message.guild.id })
                .catch(() => false)
            const featureToggles = { AUTOMOD: automod }

            const context: MessageContext = {
                guild: message.guild,
                member: message.member,
                featureToggles,
            }

            await pipeline.execute(message, context)
        } catch (error) {
            errorLog({
                message: 'Error handling message:',
                error,
            })
        }
    })
}
