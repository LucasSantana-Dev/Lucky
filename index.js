require('dotenv').config();

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { Player } = require("discord-player")

const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates]
});

// List of all commands
const commands = [];
client.commands = new Collection();

const commandsPath = path.join(__dirname, "/commands"); // E:\yt\discord bot\js\intro\commands
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
}

// Add the player on the client
client.player = new Player(client, {
    ytdlOptions: {
        quality: "highestaudio",
        highWaterMark: 1 << 25
    }
})

client.on("ready", () => {
    // Get all ids of the servers
    const guild_ids = client.guilds.cache.map(guild => guild.id);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    for (const guildId of guild_ids) {
        rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
            { body: commands })
            .then(() => console.log('Successfully updated commands for guild ' + guildId))
            .catch(console.error);
    }
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute({ client, interaction });
    }
    catch (error) {
        console.error(error);
        await interaction.reply({ content: "Ocorreu um erro ao realizar o comando." });
    }
});

client.login(process.env.TOKEN);

client.once("ready", () => {
    console.log("O LukBot está online e roteando, bebês!!");
    client.user.setActivity("Online e roteando!", { type: "PLAYING" })
})

// export default client;

// // Import Functions
// import playAudio from './commands/playAudio.js'
// import commands from './commands/commands.js.js'
// import leaveChannel from './commands/leave.js.js'

// // Import commands data
// import data from './config/data.js'

// // Snore
// let snoreCommand = data.filter((command) => command.name === 'Sleep')[0]
// playAudio(snoreCommand.audio, snoreCommand.command)

// // Nyo
// let nyoCommand = data.filter((command) => command.name === 'Nyo')[0]
// playAudio(nyoCommand.audio, nyoCommand.command)

// // Hamoud
// let hamoudCommand = data.filter((command) => command.name === 'Hamoud')[0]
// playAudio(hamoudCommand.audio, hamoudCommand.command)


// // Palmeiras
// let palmeirasCommand = data.filter((command) => command.name === 'Palmeiras')[0]
// playAudio(palmeirasCommand.audio, palmeirasCommand.command)

// // Flamengo
// let flamengoCommand = data.filter((command) => command.name === 'Flamengo')[0]
// playAudio(flamengoCommand.audio, flamengoCommand.command)

// // Brasil
// let brasilCommand = data.filter((command) => command.name === 'Brasil')[0]
// playAudio(brasilCommand.audio, brasilCommand.command)

// // Brasil
// let atumalacaCommand = data.filter((command) => command.name === 'Atumalaca')[0]
// playAudio(atumalacaCommand.audio, atumalacaCommand.command)

// // Commands
// let helpCommand = "comandos"
// commands(helpCommand)

// //Leave
// let leaveCommand = "leave"
// leaveChannel(leaveCommand)