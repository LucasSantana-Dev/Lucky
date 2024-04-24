import {
  Client,
  GatewayIntentBits,
  ActivityType
} from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { commands } from '../commands/index.js';
import { log } from './logs.js';

export const createClient = () => (
  new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates
    ]
  })
)

export const startClient = ({ client }) => {
  client.login(process.env.TOKEN);

  client.once("ready", () => {
    log.info("O LukBot está online e pocando, bebês!!");
    client.user.setPresence({
      activities: [{
        name: `Online e pocando, bebês`,
        type: ActivityType.Watching
      }]
    })
  })
}

export const mapGuildIds = ({ client }) => {
  client.on("ready", () => {
    // Get all ids of the servers
    const guild_ids = client.guilds.cache.map(guild => guild.id);

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    for (const guildId of guild_ids) {
      rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: commands.map(command => command.data) })
        .then(() => log.info('Successfully updated commands for guild ' + guildId))
        .catch((err) => log.error(err));
    }
  });
}

export const setClientProperty = ({ client, property, value }) => {
  client[property] = value;
}

