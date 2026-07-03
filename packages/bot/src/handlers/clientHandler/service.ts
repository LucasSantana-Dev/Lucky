import { Client, GatewayIntentBits, REST, Routes, Collection } from 'discord.js'
import type { Player } from 'discord-player'
import { errorLog, infoLog, debugLog } from '@lucky/shared/utils'
import type { CustomClient } from '../../types'
import { config } from '@lucky/shared/config'
import type Command from '../../models/Command'
import type ContextMenuCommand from '../../models/ContextMenuCommand'
import { startPresenceRotation } from './presence'
import { modDigestSchedulerService } from '../../utils/moderation/modDigestScheduler'
import { birthdayScheduler } from '../../utils/general/birthdayScheduler'
import { reminderScheduler } from '../../utils/general/reminderScheduler'
import { giveawayScheduler } from '../../utils/general/giveawayScheduler' 
import { criativariaLiveNotificationService } from '../../services/CriativariaLiveNotificationService'

let presenceControls: {
    stop: () => void
    pause: () => void
    resume: () => void
} | null = null

export function stopPresenceRotation(): void {
    if (presenceControls) {
        presenceControls.stop()
        presenceControls = null
    }
}

export async function createClient(): Promise<CustomClient> {
    try {
        const { TOKEN, CLIENT_ID } = config()

        if (!TOKEN || !CLIENT_ID) {
            throw new Error('DISCORD_TOKEN or CLIENT_ID not configured')
        }

        const client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                // Privileged intent (portal toggle verified ON, LIMITED tier):
                // required for GuildMemberAdd/Remove/Update — welcome/leave
                // messages, autoroles, and role-exclusion enforcement (#1667)
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMessageReactions,
            ],
        }) as CustomClient

        client.commands = new Collection<string, Command>()
        client.contextMenus = new Collection<string, ContextMenuCommand>()
        client.player = null as unknown as Player

        debugLog({ message: 'Discord client created successfully' })
        return client
    } catch (error) {
        errorLog({ message: 'Error creating Discord client:', error })
        throw error
    }
}

export async function startClient({
    client,
}: {
    client: CustomClient
}): Promise<void> {
    const { TOKEN, CLIENT_ID } = config()

    if (!TOKEN || !CLIENT_ID) {
        throw new Error('DISCORD_TOKEN or CLIENT_ID not configured')
    }

    const readyPromise = new Promise<void>((resolve) => {
        client.once('ready', async () => {
            try {
                if (client.user) {
                    infoLog({
                        message: `Bot logged in as ${client.user.tag}`,
                    })
                    presenceControls?.stop()
                    presenceControls = startPresenceRotation(client)
                }

                const rest = new REST({ version: '10' }).setToken(TOKEN)
                const commandsData = [
                    ...client.commands.map((cmd) => cmd.data.toJSON()),
                    ...client.contextMenus.map((cmd) => cmd.data.toJSON()),
                ]

                for (const guild of client.guilds.cache.values()) {
                    await rest.put(
                        Routes.applicationGuildCommands(CLIENT_ID, guild.id),
                        { body: commandsData },
                    )
                    infoLog({
                        message: `Guild commands registered: ${guild.name}`,
                    })
                }

                const { startTwitchService } =
                    await import('../../twitch/index.js')
                await startTwitchService(client)

                const { startRssBridgeService } =
                    await import('../../services/RssBridgeService.js')
                await startRssBridgeService(client)
            } catch (error) {
                errorLog({
                    message: 'Error in ready handler:',
                    error,
                })
            }

            // Run the digest scheduler startup independently so an upstream
            // failure (command registration, twitch service) cannot suppress
            // weekly digests for the entire process.
            try {
                modDigestSchedulerService.start(client)
            } catch (error) {
                errorLog({
                    message: 'Failed to start mod digest scheduler',
                    error,
                })
            }

            try {
                birthdayScheduler.start(client)
            } catch (error) {
                errorLog({
                    message: 'Failed to start birthday scheduler',
                    error,
                })
            }

            try {
                reminderScheduler.start(client)
            } catch (error) {
                errorLog({
                    message: 'Failed to start reminder scheduler',
                    error,
                })
            }

            try {
                giveawayScheduler.start(client)
            } catch (error) {
                errorLog({
                    message: 'Failed to start giveaway scheduler',
                    error,
                })
            }

            try {
                criativariaLiveNotificationService.start(client)
            } catch (error) {
                errorLog({
                    message:
                        'Failed to start Criativaria live notification service',
                    error,
                })
            }

            resolve()
        })
    })

    await client.login(TOKEN)
    await readyPromise
}
