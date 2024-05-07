import { Client, GatewayIntentBits, ActivityType } from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import commands from '../utils/commands.js';
import { config } from '../config/config.js';

export const createClient = () => (
  new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates
    ]
  })
);

export const startClient = ({ client }) => {
  try {
    client.login(config.TOKEN);

    client.once("ready", () => {
      console.info("O LukBot está online e pocando, bebês!!");
      client.user.setPresence({
        activities: [{
          name: `Online e pocando, bebês`,
          type: ActivityType.Watching
        }]
      });
    });
  } catch (err) {
    console.error('Error starting client:', err);
  }
};

export const mapGuildIds = ({ client }) => {
  try {
    client.on("ready", async () => {
      // Get all ids of the servers
      const guild_ids = client.guilds.cache.map(guild => guild.id);

      const rest = new REST({ version: '10' }).setToken(config().TOKEN);
      for (const guildId of guild_ids) {
        rest.put(Routes.applicationGuildCommands(config().CLIENT_ID, guildId),
          { body: commands.map(command => command.data) })
          .then(() => console.info('Successfully updated commands for guild ' + guildId))
          .catch((err) => console.error(err));
      }
    });
  } catch (err) {
    console.error('Error mapping guild ids:', err);
  }
};

export const setClientProperty = ({ client, property, value }) => {
  client[property] = value;
};
