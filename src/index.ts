import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { Player, GuildQueue, Track } from 'discord-player';
import { config } from 'dotenv';
import { errorLog, infoLog, debugLog, setLogLevel, LogLevel } from './utils/general/log';
import { createClient, startClient, mapGuildIds } from './handlers/clientHandler';
import { createPlayer } from './handlers/playerHandler';
import { setCommands } from './handlers/commandsHandler';
import { getCommands } from './utils/command/commands';
import handleEvents from './handlers/eventHandler';
import { CustomClient } from './types';
import Command from './models/Command';

// Load environment variables
const result = config();
if (result.error) {
    errorLog({ message: 'Error loading .env file:', error: result.error });
    process.exit(1);
}

debugLog({ message: 'Environment variables loaded' });
debugLog({ message: `DISCORD_TOKEN exists: ${!!process.env.DISCORD_TOKEN}` });

// Set log level based on environment
const logLevel = process.env.LOG_LEVEL
    ? parseInt(process.env.LOG_LEVEL)
    : LogLevel.INFO;
setLogLevel(logLevel);

// Global error handlers
process.on('uncaughtException', (error) => {
    errorLog({ message: 'Uncaught Exception:', error });
});

process.on('unhandledRejection', (error) => {
    errorLog({ message: 'Unhandled Rejection:', error });
});

// Create Discord client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
}) as CustomClient;

// Initialize commands collection
client.commands = new Collection<string, Command>();

// Setup event handlers
handleEvents(client);

// Login to Discord
const token = process.env.DISCORD_TOKEN;
if (!token) {
    errorLog({ message: 'DISCORD_TOKEN is not defined in environment variables' });
    process.exit(1);
}

debugLog({ message: `Token length: ${token.length}` });
// client.login(token)
//     .then(() => {
//         infoLog({ message: 'Bot is ready!' });
//     })
//     .catch((error) => {
//         errorLog({ message: 'Error logging in:', error });
//     });

// Start the bot
async function start() {
    const startTime = Date.now();
    try {
        infoLog({ message: 'Starting bot initialization...' });

        // Create and initialize client
        const clientCreationStart = Date.now();
        const client = createClient();
        if (!client.login) {
            throw new Error('Failed to create Discord client');
        }
        debugLog({ message: `Client creation took ${Date.now() - clientCreationStart}ms` });

        // Setup event handlers
        const eventSetupStart = Date.now();
        handleEvents(client);
        debugLog({ message: `Event handler setup took ${Date.now() - eventSetupStart}ms` });

        // Start the client (this will handle login and event setup)
        const clientStartTime = Date.now();
        startClient({ client });
        debugLog({ message: `Client start process initiated in ${Date.now() - clientStartTime}ms` });

        // Initialize player and load commands in parallel
        const [player, commandList] = await Promise.all([
            (async () => {
                const playerStartTime = Date.now();
                try {
                    const player = createPlayer({ client });
                    client.player = player;
                    debugLog({ message: `Player initialization took ${Date.now() - playerStartTime}ms` });
                    return player;
                } catch (error) {
                    errorLog({ message: 'Error creating player:', error });
                    // Create a minimal player to prevent null reference errors
                    const player = {} as Player;
                    client.player = player;
                    return player;
                }
            })(),
            (async () => {
                const commandsStartTime = Date.now();
                try {
                    debugLog({ message: 'Loading commands...' });
                    const commands = await getCommands();
                    debugLog({ message: `Command loading took ${Date.now() - commandsStartTime}ms` });
                    return commands;
                } catch (error) {
                    errorLog({ message: 'Error loading commands:', error });
                    return [];
                }
            })()
        ]);

        // Initialize player events
        player.events.on('playerStart', (queue: GuildQueue, track: Track) => {
            debugLog({ message: `Started playing: ${track.title}` });
        });

        player.events.on('error', (queue: GuildQueue, error: Error) => {
            errorLog({ message: `Player error: ${error.message}` });
        });

        // Register commands only after client is ready
        client.once('ready', async () => {
            if (commandList.length > 0) {
                try {
                    // Set commands in client collection
                    const setCommandsStartTime = Date.now();
                    debugLog({ message: 'Setting commands in client collection...' });
                    await setCommands({ client, commands: commandList });
                    debugLog({ message: `Setting commands took ${Date.now() - setCommandsStartTime}ms` });

                    // Register commands with Discord API
                    const registerCommandsStartTime = Date.now();
                    debugLog({ message: 'Registering commands with Discord API...' });
                    await mapGuildIds({ client });
                    debugLog({ message: `Registering commands took ${Date.now() - registerCommandsStartTime}ms` });

                    // Verify commands were loaded
                    const commandCount = client.commands.size;
                    infoLog({ message: `Loaded ${commandCount} commands into client collection` });

                    if (commandCount === 0) {
                        errorLog({ message: 'No commands were loaded! This is a critical error.' });
                    }
                } catch (error) {
                    errorLog({ message: 'Error setting commands:', error });
                }
            } else {
                errorLog({ message: 'No commands were loaded! This is a critical error.' });
            }
            infoLog({ message: `Bot initialization completed successfully in ${Date.now() - startTime}ms` });
        });
    } catch (error) {
        errorLog({ message: 'Critical error starting bot:', error });
        process.exit(1);
    }
}

// Start the bot
start(); 