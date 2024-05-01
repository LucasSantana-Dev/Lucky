const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { commands } = require('../commands.js');
const { log } = require('./logs.js');

exports.createClient = () => (
  new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates
    ]
  })
);

exports.startClient = ({ client }) => {
  client.login(process.env.TOKEN);

  client.once("ready", () => {
    log.info("O LukBot está online e pocando, bebês!!");
    client.user.setPresence({
      activities: [{
        name: `Online e pocando, bebês`,
        type: ActivityType.Watching
      }]
    });
  });
};

exports.mapGuildIds = ({ client }) => {
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
};

exports.setClientProperty = ({ client, property, value }) => {
  client[property] = value;
};
