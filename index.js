const fs = require('fs');
const path = require('path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { executeCommand, setCommands } = require('./utils/createCommands.js');
const { createPlayer } = require('./utils/player.js');
const { startBot } = require('./start.js');

require('dotenv').config();

const {
    createClient,
    startClient,
    mapGuildIds,
    setClientProperty
} = require('./utils/client.js');

(async () => {
    const { client, player } = await startBot();
    await client.on("interactionCreate", async interaction => executeCommand({ interaction, client }));

    module.exports = { client, player };
})();
