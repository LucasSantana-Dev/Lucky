import { Events, type Client, type Message } from 'discord.js'
import { featureToggleService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'
import { MessagePipeline } from './message/pipeline'
import { autoModHandler } from './message/autoModHandler'
import { spamHandler } from './message/spamHandler'
import { customCommandHandler } from './message/customCommandHandler'
import { afkHandler } from './message/afkHandler'
import { xpHandler } from './message/xpHandler'
import { starboardSeedHandler } from './message/starboardSeedHandler'
import { ttlDeleteHandler } from './message/ttlDeleteHandler'
import type { MessageContext } from './message/types'

const pipeline = new MessagePipeline()
    .register(spamHandler)
    .register(ttlDeleteHandler)
    .register(autoModHandler)
    .register(customCommandHandler)
    .register(afkHandler)
    .register(xpHandler)
    .register(starboardSeedHandler)
    .register(ttlDeleteHandler)

export function handleMessageCreate(client: Client): void {
    client.on(Events.MessageCreate, async (message: Message) => {
        try {
            if (!message.guild || !message.member) return

            const [automod, customCommands] = await Promise.all([
                featureToggleService
                    .isEnabled('AUTOMOD', { guildId: message.guild.id })
                    .catch(() => false),
                featureToggleService
                    .isEnabled('CUSTOM_COMMANDS', {
                        guildId: message.guild.id,
                    })
                    .catch(() => false),
            ])
            const featureToggles = {
                AUTOMOD: automod,
                CUSTOM_COMMANDS: customCommands,
            }

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
