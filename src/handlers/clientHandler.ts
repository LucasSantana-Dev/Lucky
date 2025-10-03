import {
    Client,
    GatewayIntentBits,
    ActivityType,
    Events,
    REST,
    Routes,
    Collection,
} from "discord.js"
// import { config } from "../config/config"
import { errorLog, infoLog, warnLog, debugLog } from "../utils/general/log"
import type { CustomClient } from "../types/index"
import type Command from "../models/Command"

type StartClientParams = {
    client: CustomClient
}

type MapGuildIdsParams = {
    client: CustomClient
}

export async function registerCommands(commandsList: Command[]): Promise<void> {
    const token = process.env.DISCORD_TOKEN
    const clientId = process.env.CLIENT_ID

    if (!token || !clientId) {
        errorLog({
            message: "Missing TOKEN or CLIENT_ID in environment variables",
        })
        return
    }

    debugLog({ message: `Client ID: ${clientId}` })

    const rest = new REST().setToken(token)
    const commandsData = commandsList
        .map((cmd) => {
            try {
                const json = cmd.data.toJSON()
                return json
            } catch (error) {
                errorLog({
                    message: `Error converting command ${cmd.data.name} to JSON:`,
                    error,
                })
                return null
            }
        })
        .filter((cmd) => cmd !== null)

    if (commandsData.length === 0) {
        errorLog({ message: "No valid commands to register" })
        return
    }

    try {
        const data = await rest.put(Routes.applicationCommands(clientId), {
            body: commandsData,
        })

        infoLog({
            message: `Successfully registered ${Array.isArray(data) ? data.length : 0} application (/) commands.`,
        })
    } catch (error) {
        errorLog({
            message: "Error registering commands with Discord API:",
            error,
        })
        throw error
    }
}

export function createClient(): CustomClient {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildVoiceStates,
        ],
    }) as CustomClient

    const clientId = process.env.CLIENT_ID
    if (!clientId) {
        warnLog({
            message: "CLIENT_ID is not defined in environment variables",
        })
    }

    client.commands = new Collection<string, Command>()
    return client
}

export const startClient = ({ client }: StartClientParams): Promise<void> => {
    try {
        const token = process.env.DISCORD_TOKEN
        if (!token) {
            warnLog({
                message:
                    "DISCORD_TOKEN is not defined in environment variables",
            })
            return Promise.resolve()
        }

        if (client.isReady()) {
            debugLog({ message: "Client is already logged in, skipping login" })
            return Promise.resolve()
        }

        debugLog({ message: "Attempting to log in to Discord..." })

        client.on("debug", (info: string) => {
            debugLog({ message: `Discord Debug: ${info}` })
        })

        process.on("unhandledRejection", (reason, promise) => {
            errorLog({ message: "Unhandled Rejection at:", error: reason })
            debugLog({ message: "Promise:", data: promise })
        })

        // Set up event handlers before login
        client.once(Events.ClientReady, async () => {
            try {
                client.user?.setPresence({
                    activities: [
                        {
                            name: `Online e pocando, bebês`,
                            type: ActivityType.Playing,
                        },
                    ],
                    status: "online",
                })
            } catch (error) {
                errorLog({ message: "Error in client ready event:", error })
            }
        })

        client.on(Events.Error, (error: Error) => {
            errorLog({ message: "Discord client error:", error })
        })

        client.on(Events.Warn, (warning: string) => {
            warnLog({ message: `Discord client warning: ${warning}` })
        })

        debugLog({ message: "About to call client.login with token" })
        return client
            .login(token)
            .then(() => {
                debugLog({ message: "Login promise resolved successfully" })
            })
            .catch((error: Error) => {
                errorLog({ message: "Error logging in to Discord:", error })
                if (error instanceof Error) {
                    errorLog({ message: "Error name:", data: error.name })
                    errorLog({ message: "Error message:", data: error.message })
                    errorLog({ message: "Error stack:", data: error.stack })
                }
                throw error
            })
    } catch (error) {
        errorLog({ message: "Error starting client:", error })
        return Promise.reject(error)
    }
}

export const mapGuildIds = async ({
    client,
}: MapGuildIdsParams): Promise<void> => {
    try {
        const token = process.env.DISCORD_TOKEN
        const clientId = process.env.CLIENT_ID
        if (!token || !clientId) {
            warnLog({
                message:
                    "DISCORD_TOKEN or CLIENT_ID is not defined in environment variables",
            })
            return
        }

        if (!client.isReady()) {
            warnLog({
                message: "Client is not ready, waiting for ClientReady event",
            })
            return
        }

        debugLog({ message: "Mapping guild information..." })

        const guilds = client.guilds.cache.map((guild) => ({
            id: guild.id,
            name: guild.name,
            memberCount: guild.memberCount,
        }))

        debugLog({
            message: `Client is in ${guilds.length} guilds`,
            data: guilds,
        })

        infoLog({ message: `Successfully mapped ${guilds.length} guilds` })
    } catch (error) {
        errorLog({ message: "Error mapping guild ids:", error })
    }
}
