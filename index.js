const dotenv = require('dotenv').config();
const { Client, Intents } = require('discord.js')
const client = new Client({
    intents: [Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_VOICE_STATES]
})
const { joinVoiceChannel, createAudioResource } = require('@discordjs/voice');
const { createAudioPlayer } = require('@discordjs/voice')
const config = require('./config.json')
const prefix = config.prefix
const token = process.env.DISCORD_TOKEN;

client.login(token)

client.once("ready", () => {
    console.log("The bot is now online!");
    client.user.setActivity("Online e roteando!", { type: "WATCHING" })
})
// Ping Pong
client.on("messageCreate", (message) => {
    if (message.content.startsWith("ping")) {
        message.channel.send("pong!");
    }
});

// Join
client.on('messageCreate', async message => {
    function isCommand(command) {
        return !!message.content.toLowerCase().startsWith(prefix + command);
    };

    if (isCommand('join')) {
        const channel = message.member.voice.channel;
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator
        })

        if (!channel)
            return interaction.reply({ content: "⛔ Você deve estar em um canal de voz.", ephemeral: true })
    }
})

// Snore
client.on('messageCreate', async message => {
    function isCommand(command) {
        return !!message.content.toLowerCase().startsWith(prefix + command);
    };

    if (isCommand('sleep')) {
        const channel = message.member.voice.channel;
        if (!channel)
            return interaction.reply({ content: "⛔ Você deve estar em um canal de voz.", ephemeral: true })

        const player = createAudioPlayer();
        const resource = createAudioResource('sounds/snore.mp3')

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator
        })

        player.play(resource)
        connection.subscribe(player);
        return interaction.reply({ content: "Tocando áudio.", ephemeral: true })
    }
})

// Quandale dingle
client.on('messageCreate', async message => {
    function isCommand(command) {
        return !!message.content.toLowerCase().startsWith(prefix + command);
    };

    if (isCommand('quandale')) {
        const channel = message.member.voice.channel;
        if (!channel)
            return interaction.reply({ content: "⛔ Você deve estar em um canal de voz.", ephemeral: true })

        const player = createAudioPlayer();
        const resource = createAudioResource('sounds/quandale_dingle.mp3')

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator
        })

        player.play(resource)
        connection.subscribe(player);
        return interaction.reply({ content: "Tocando áudio.", ephemeral: true })
    }
})

// Quandale dingle
client.on('messageCreate', async message => {
    function isCommand(command) {
        return !!message.content.toLowerCase().startsWith(prefix + command);
    };

    if (isCommand('nyo')) {
        const channel = message.member.voice.channel;
        if (!channel)
            return interaction.reply({ content: "⛔ Você deve estar em um canal de voz.", ephemeral: true })

        const player = createAudioPlayer();
        const resource = createAudioResource('sounds/nyo.mp3')

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator
        })

        player.play(resource)
        connection.subscribe(player);
        return interaction.reply({ content: "Tocando áudio.", ephemeral: true })
    }
})

module.exports = client;