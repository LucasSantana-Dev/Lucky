import { Client, GatewayIntentBits, ActivityType } from 'discord.js';
import { REST } from '@discordjs/rest';
import commands from '../utils/commands.js';
import { config } from '../config/config.js';
import { errorLog, infoLog } from '../utils/log.js';

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
      infoLog({ message: "O LukBot está online e pocando, bebês!!" });
      client.user.setPresence({
        activities: [{
          name: `Online e pocando, bebês`,
          type: ActivityType.Watching
        }]
      });
    });
  } catch (error) {
    errorLog({ message: 'Error starting client:', error });
  }
};

export const mapGuildIds = ({ client }) => {
  try {
    client.on("ready", async () => {
      // Get all ids of the servers
      const guild_ids = client.guilds.cache.map(guild => guild.id);

      const rest = new REST({ version: '10' }).setToken(config().TOKEN);
      for (const guildId of guild_ids) {
        rest.put(`/applications/${config().CLIENT_ID}/guilds/${guildId}/commands`,
          { body: commands.map(command => command.data) })
          .then(() => infoLog('Successfully updated commands for guild ' + guildId))
          .catch((error) => errorLog({ error }));
      }
    });
  } catch (error) {
    errorLog({ message: 'Error mapping guild ids:', error });
  }
};

export const setClientProperty = ({ client, property, value }) => {
  client[property] = value;
};
