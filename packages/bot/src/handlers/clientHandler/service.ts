import {
    Client,
    GatewayIntentBits,
    ActivityType,
    REST,
    Routes,
    Collection,
} from 'discord.js'
import type { Player } from 'discord-player'
import { errorLog, infoLog, debugLog } from '@lukbot/shared/utils'
import type { CustomClient } from '../../types'
import { config } from '@lukbot/shared/config'
import type Command from '../../models/Command'

export async function createClient(): Promise<CustomClient> {
    try {
        const { TOKEN, CLIENT_ID } = config()

        if (!TOKEN || !CLIENT_ID) {
            throw new Error('DISCORD_TOKEN or CLIENT_ID not configured')
        }

        const client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.MessageContent,
            ],
        }) as CustomClient

        client.commands = new Collection<string, Command>()
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
    try {
        const { TOKEN, CLIENT_ID } = config()

        if (!TOKEN || !CLIENT_ID) {
            throw new Error('DISCORD_TOKEN or CLIENT_ID not configured')
        }

        await client.login(TOKEN)

        client.once('ready', () => {
            if (client.user) {
                infoLog({
                    message: `Bot logged in as ${client.user.tag}`,
                })

                client.user.setActivity('Music', {
                    type: ActivityType.Listening,
                })
            }
        })

        const rest = new REST({ version: '10' }).setToken(TOKEN)

        try {
            infoLog({
                message: `Started refreshing ${client.commands.size} application (/) commands.`,
            })

            const commandsData = client.commands.map((cmd) => cmd.data.toJSON())

            await rest.put(Routes.applicationCommands(CLIENT_ID), {
                body: commandsData,
            })

            infoLog({
                message: `Successfully reloaded ${commandsData.length} application (/) commands.`,
            })
        } catch (error) {
            errorLog({ message: 'Error refreshing commands:', error })
        }
    } catch (error) {
        errorLog({ message: 'Error starting Discord client:', error })
        throw error
    }
}
