import type { Player, GuildQueue, Track } from "discord-player"
import { Events } from "discord.js"
import { debugLog, errorLog, infoLog } from "../utils/general/log"
import {
    createClient,
    startClient,
    mapGuildIds,
} from "../handlers/clientHandler"
import { createPlayer } from "../handlers/playerHandler"
import { setCommands } from "../handlers/commandsHandler"
import { getCommands } from "../utils/command/commands"
import type Command from "../models/Command"
import handleEvents from "../handlers/eventHandler"
import type { CustomClient } from "../types"
import { ConfigurationError } from "../types/errors"
import { redisInitializationService } from "../services/RedisInitializationService"

let client: CustomClient | null = null
let isInitialized = false

export async function initializeBot() {
    if (isInitialized) {
        infoLog({ message: "Bot already initialized, skipping initialization" })
        return client
    }

    try {
        infoLog({ message: "Starting bot initialization..." })

        // Initialize Redis services first
        const redisInitStart = Date.now()
        const redisInitialized = await redisInitializationService.initialize()
        if (!redisInitialized) {
            errorLog({
                message:
                    "Redis initialization failed, continuing with in-memory fallback",
            })
        } else {
            debugLog({
                message: `Redis initialization took ${Date.now() - redisInitStart}ms`,
            })
        }

        const clientCreationStart = Date.now()
        const newClient = createClient()
        if (!newClient?.login) {
            throw new ConfigurationError("Failed to create Discord client", {
                details: { clientCreation: "failed" },
            })
        }
        client = newClient
        debugLog({
            message: `Client creation took ${Date.now() - clientCreationStart}ms`,
        })

        const eventSetupStart = Date.now()
        handleEvents(client)
        debugLog({
            message: `Event handler setup took ${Date.now() - eventSetupStart}ms`,
        })

        const clientStartTime = Date.now()
        await startClient({ client })
        debugLog({
            message: `Client start process completed in ${Date.now() - clientStartTime}ms`,
        })

        const [player, commandList] = await Promise.all([
            initializePlayer(client),
            loadCommands(),
        ])

        setupPlayerEvents(player)

        if (!client)
            throw new ConfigurationError("Client is null", {
                details: { initialization: "failed" },
            })

        // Wait for client to be ready, then register commands
        debugLog({ message: "Waiting for client to be ready..." })
        await new Promise<void>((resolve) => {
            if (client?.isReady()) {
                debugLog({ message: "Client is already ready" })
                resolve()
            } else if (client) {
                debugLog({
                    message:
                        "Client not ready, waiting for ClientReady event...",
                })
                client.once(Events.ClientReady, () => {
                    debugLog({ message: "ClientReady event fired!" })
                    resolve()
                })
            } else {
                debugLog({ message: "Client is null, resolving anyway" })
                resolve() // If client is null, just resolve
            }
        })
        debugLog({
            message: "Client ready, proceeding with command registration...",
        })

        await setupCommandRegistration(client, commandList)

        isInitialized = true
        return client
    } catch (error) {
        errorLog({ message: "Error during bot initialization:", error })
        throw error
    }
}

async function initializePlayer(client: CustomClient) {
    const playerStartTime = Date.now()
    try {
        if (!client)
            throw new ConfigurationError("Client is null", {
                details: { playerInitialization: "failed" },
            })
        const player = createPlayer({ client })
        client.player = player
        debugLog({
            message: `Player initialization took ${Date.now() - playerStartTime}ms`,
        })
        return player
    } catch (error) {
        errorLog({ message: "Error creating player:", error })
        const player = {} as Player
        if (client) client.player = player
        return player
    }
}

async function loadCommands() {
    const commandsStartTime = Date.now()
    try {
        debugLog({ message: "Loading commands..." })
        const commands = await getCommands()

        const downloadCommands = commands.filter(
            (cmd) => cmd.category === "download",
        ).length
        const generalCommands = commands.filter(
            (cmd) => cmd.category === "general",
        ).length
        const musicCommands = commands.filter(
            (cmd) => cmd.category === "music",
        ).length

        debugLog({
            message: `Loaded commands: ${downloadCommands} download, ${generalCommands} general, ${musicCommands} music`,
        })

        debugLog({
            message: `Command loading took ${Date.now() - commandsStartTime}ms`,
        })
        return commands
    } catch (error) {
        errorLog({ message: "Error loading commands:", error })
        return []
    }
}

function setupPlayerEvents(player: Player) {
    player.events.on("playerStart", (_queue: GuildQueue, track: Track) => {
        debugLog({ message: `Started playing: ${track.title}` })
    })

    player.events.on("error", (_queue: GuildQueue, error: Error) => {
        errorLog({ message: `Player error: ${error.message}` })
    })
}

async function setupCommandRegistration(
    client: CustomClient,
    commandList: unknown[],
) {
    if (commandList.length > 0) {
        try {
            const setCommandsStartTime = Date.now()
            await setCommands({
                client,
                commands: commandList as Command[],
            })
            debugLog({
                message: `Setting commands took ${Date.now() - setCommandsStartTime}ms`,
            })

            const registerCommandsStartTime = Date.now()
            debugLog({
                message: "Registering commands with Discord API...",
            })
            const { registerCommands } = await import(
                "../handlers/clientHandler"
            )
            await registerCommands(commandList as Command[])
            debugLog({
                message: `Registering commands took ${Date.now() - registerCommandsStartTime}ms`,
            })

            await mapGuildIds({ client })

            const commandCount = client.commands.size
            infoLog({
                message: `Loaded ${commandCount} commands into client collection`,
            })

            if (commandCount === 0) {
                errorLog({
                    message:
                        "No commands were loaded! This is a critical error.",
                })
            }
        } catch (error) {
            errorLog({ message: "Error setting commands:", error })
        }
    } else {
        errorLog({
            message: "No commands were loaded! This is a critical error.",
        })
    }
}
