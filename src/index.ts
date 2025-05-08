import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
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
import { clearAllTimers } from './utils/timerManager';

// Initialize Sentry if DSN is provided
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    environment: process.env.NODE_ENV || 'development',
    integrations: [nodeProfilingIntegration()],
    profileSessionSampleRate: 1.0,
    profileLifecycle: 'trace',
    sendDefaultPii: true,
  });
}

// Load environment variables
const result = config();
if (result.error) {
    if ((result.error as any).code !== 'ENOENT') {
        errorLog({ message: 'Error loading .env file:', error: result.error });
        process.exit(1);
    }
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
    clearAllTimers();
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    errorLog({ message: 'Unhandled Rejection:', error });
    clearAllTimers();
    process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    infoLog({ message: 'Received SIGINT, shutting down gracefully...' });
    clearAllTimers();
    process.exit(0);
});

process.on('SIGTERM', () => {
    infoLog({ message: 'Received SIGTERM, shutting down gracefully...' });
    clearAllTimers();
    process.exit(0);
});

let client: CustomClient | null = null;
let isInitialized = false;

// Start the bot
async function start() {
    if (isInitialized) {
        infoLog({ message: 'Bot already initialized, skipping initialization' });
        return;
    }

    const startTime = Date.now();
    try {
        infoLog({ message: 'Starting bot initialization...' });

        // Create and initialize client
        const clientCreationStart = Date.now();
        const newClient = createClient();
        if (!newClient || !newClient.login) {
            throw new Error('Failed to create Discord client');
        }
        client = newClient;
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
                    if (!client) throw new Error('Client is null');
                    const player = createPlayer({ client });
                    client.player = player;
                    debugLog({ message: `Player initialization took ${Date.now() - playerStartTime}ms` });
                    return player;
                } catch (error) {
                    errorLog({ message: 'Error creating player:', error });
                    // Create a minimal player to prevent null reference errors
                    const player = {} as Player;
                    if (client) client.player = player;
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
        if (!client) throw new Error('Client is null');
        const finalClient = client; // Create a non-null reference for the event handler
        finalClient.once('ready', async () => {
            if (commandList.length > 0) {
                try {
                    // Set commands in client collection
                    const setCommandsStartTime = Date.now();
                    debugLog({ message: 'Setting commands in client collection...' });
                    await setCommands({ client: finalClient, commands: commandList });
                    debugLog({ message: `Setting commands took ${Date.now() - setCommandsStartTime}ms` });

                    // Register commands with Discord API
                    const registerCommandsStartTime = Date.now();
                    debugLog({ message: 'Registering commands with Discord API...' });
                    await mapGuildIds({ client: finalClient });
                    debugLog({ message: `Registering commands took ${Date.now() - registerCommandsStartTime}ms` });

                    // Verify commands were loaded
                    const commandCount = finalClient.commands.size;
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

        isInitialized = true;
    } catch (error) {
        errorLog({ message: 'Error during bot initialization:', error });
        throw error;
    }
}

// Lambda handler
export const handler = async (event: any, context: any) => {
    try {
        await start();
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Bot initialized successfully',
                timestamp: new Date().toISOString()
            })
        };
    } catch (error) {
        errorLog({ message: 'Error in Lambda handler:', error });
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error initializing bot',
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            })
        };
    }
}; 