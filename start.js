const fs = require('fs');
const path = require('path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { executeCommand, setCommands } = require('./utils/createCommands.js');
const { createPlayer } = require('./utils/player.js');

require('dotenv').config();

const {
  createClient,
  startClient,
  mapGuildIds,
  setClientProperty
} = require('./utils/client.js');

exports.startBot = async () => {
  const client = await createClient();

  await startClient({ client });
  const player = createPlayer({ client });
  setClientProperty({
    client,
    property: 'player',
    value: player
  });
  await setCommands({ client });
  mapGuildIds({ client });

  return { client, player };
};
