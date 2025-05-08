import {
  Client,
  GatewayIntentBits,
  ActivityType,
  Events,
  REST,
  Routes,
  Collection
} from 'discord.js';
import { getCommands } from '../utils/command/commands';
import { config } from '../config/config';
import { errorLog, infoLog, warnLog, debugLog } from '../utils/general/log';
import { CustomClient } from '../types/index';
import Command from '../models/Command';
import { setCommands } from './commandsHandler';

interface StartClientParams {
  client: CustomClient;
}

interface MapGuildIdsParams {
  client: CustomClient;
}

async function registerCommands(client: CustomClient, commandsList: Command[]): Promise<void> {
  const token = config().TOKEN;
  const clientId = config().CLIENT_ID;

  if (!token || !clientId) {
    errorLog({ message: 'Missing TOKEN or CLIENT_ID in environment variables' });
    return;
  }

  debugLog({ message: `Client ID: ${clientId}` });

  const rest = new REST().setToken(token);
  const commandsData = commandsList.map(cmd => {
    try {
      const json = cmd.data.toJSON();
      return json;
    } catch (error) {
      errorLog({ message: `Error converting command ${cmd.data.name} to JSON:`, error });
      return null;
    }
  }).filter(cmd => cmd !== null);

  if (commandsData.length === 0) {
    errorLog({ message: 'No valid commands to register' });
    return;
  }

  try {
    // Register commands globally
    const data = await rest.put(
      Routes.applicationCommands(clientId),
      { body: commandsData }
    );

    infoLog({ message: `Successfully registered ${Array.isArray(data) ? data.length : 0} application (/) commands.` });
  } catch (error) {
    errorLog({ message: 'Error registering commands with Discord API:', error });
    throw error;
  }
}

export function createClient(): CustomClient {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates
    ]
  }) as CustomClient;

  client.commands = new Collection<string, Command>();
  return client;
}

export const startClient = ({ client }: StartClientParams): void => {
  try {
    const token = config().TOKEN;
    if (!token) {
      warnLog({ message: 'TOKEN is not defined in environment variables' });
      return;
    }
    
    // Check if client is already logged in
    if (client.isReady()) {
      debugLog({ message: 'Client is already logged in, skipping login' });
      return;
    }
    
    client.login(token).catch(error => {
      errorLog({ message: 'Error logging in to Discord:', error });
    });

    client.once(Events.ClientReady, async () => {
      try {
        // Set bot presence
        client.user?.setPresence({
          activities: [{
            name: `Online e pocando, bebês`,
            type: ActivityType.Playing
          }],
          status: 'online'
        });

        const commandsList = await getCommands();

        if (commandsList.length === 0) {
          errorLog({ message: 'No commands were loaded' });
          return;
        }

        await setCommands({ client, commands: commandsList });

        infoLog({ message: 'Registering commands...' });
        await registerCommands(client, commandsList);
      } catch (error) {
        errorLog({ message: 'Error in client ready event:', error });
      }
    });
    
    // Add error event handler to prevent crashes
    client.on(Events.Error, (error) => {
      errorLog({ message: 'Discord client error:', error });
    });
    
    // Add warning event handler
    client.on(Events.Warn, (warning) => {
      warnLog({ message: `Discord client warning: ${warning}` });
    });
  } catch (error) {
    errorLog({ message: 'Error starting client:', error });
  }
};

export const mapGuildIds = async ({ client }: MapGuildIdsParams): Promise<void> => {
  try {
    const token = config().TOKEN;
    const clientId = config().CLIENT_ID;
    if (!token || !clientId) {
      warnLog({ message: 'TOKEN or CLIENT_ID is not defined in environment variables' });
      return;
    }

    // Check if client is ready
    if (!client.isReady()) {
      warnLog({ message: 'Client is not ready, waiting for ClientReady event' });
      return;
    }

    // Use commands already loaded in the client instead of loading them again
    if (!client.commands || client.commands.size === 0) {
      warnLog({ message: 'No commands found in client collection, skipping registration' });
      return;
    }

    // Convert commands to the format needed for Discord API
    const commandsData = Array.from(client.commands.values()).map(command => command.data.toJSON());

    // Create REST instance
    const rest = new REST().setToken(token);

    // Register commands globally
    debugLog({ message: 'Started refreshing application (/) commands.' });
    try {
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commandsData }
      );
      infoLog({ message: 'Successfully registered commands globally' });
    } catch (error) {
      errorLog({ message: 'Error registering commands:', error });
    }
  } catch (error) {
    errorLog({ message: 'Error mapping guild ids:', error });
  }
}; 