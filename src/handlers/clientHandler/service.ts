import {
    Client,
    GatewayIntentBits,
    ActivityType,
    REST,
    Routes,
    Collection,
} from 'discord.js'
import { errorLog, infoLog, debugLog } from '../../utils/general/log'
import type { CustomClient } from '../../types/index'
import type { RegisterCommandsOptions } from './types'

/**
 * Client handler service
 */
export class ClientHandlerService {
    async createClient(): Promise<CustomClient> {
        const intents = [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
        ]

        const client = new Client({
            intents,
            presence: {
                activities: [
                    {
                        name: '🎵 Music',
                        type: ActivityType.Listening,
                    },
                ],
                status: 'online',
            },
        }) as CustomClient

        // Add custom properties
        client.commands = new Collection()
        client.cooldowns = new Collection()

        return client
    }

    async startClient({ client }: { client: CustomClient }): Promise<void> {
        try {
            const token = process.env.DISCORD_TOKEN
            if (!token) {
                throw new Error(
                    'DISCORD_TOKEN not found in environment variables',
                )
            }

            await client.login(token)
            infoLog({ message: 'Discord client started successfully' })
        } catch (error) {
            errorLog({ message: 'Failed to start Discord client:', error })
            throw error
        }
    }

    async registerCommands({
        commands,
        token,
        clientId,
    }: RegisterCommandsOptions): Promise<void> {
        try {
            const rest = new REST({ version: '10' }).setToken(token)

            const commandData = commands.map((command) => command.data.toJSON())

            await rest.put(Routes.applicationCommands(clientId), {
                body: commandData,
            })

            infoLog({
                message: `Successfully registered ${commands.length} commands`,
            })
        } catch (error) {
            errorLog({ message: 'Failed to register commands:', error })
            throw error
        }
    }

    async mapGuildIds({ client }: { client: CustomClient }): Promise<void> {
        try {
            const guildIds = client.guilds.cache.map((guild) => guild.id)
            debugLog({ message: `Mapped ${guildIds.length} guild IDs` })
        } catch (error) {
            errorLog({ message: 'Failed to map guild IDs:', error })
            throw error
        }
    }
}
