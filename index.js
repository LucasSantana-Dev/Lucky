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

let dennyCount = 0

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

// Leave
client.on('messageCreate', async message => {
    function isCommand(command) {
        return !!message.content.toLowerCase().startsWith(prefix + command);
    };

    if (isCommand('leave')) {
        const channel = message.member.voice.channel;
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator
        })

        if (!channel)
            return interaction.reply({ content: "⛔ Você deve estar em um canal de voz.", ephemeral: true })
        connection.destroy();
        message.channel.send("Até mais!!")
    }
})

// Inactivity checker
function inactivityConnDestroy() {
    const subscription = connection.subscribe(player);
    if (subscription) {
        // Unsubscribe after 20 seconds (stop playing audio on the voice connection)
        setTimeout(() => subscription.unsubscribe(), 20_000);
    }
}

// Denny Count
client.on('messageCreate', async message => {
    function isCommand(command) {
        return !!message.content.toLowerCase().startsWith(prefix + command);
    };
    if (isCommand('denny')) {
        ++dennyCount
        message.channel.send(`O denny já foi incel ${dennyCount} vezes. `)
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
        message.channel.send("Tocando áudio!");

        inactivityConnDestroy()
    }
})

// Nyo
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
        message.channel.send("Tocando áudio!");

        inactivityConnDestroy()
    }
})

// Hamoud
client.on('messageCreate', async message => {
    function isCommand(command) {
        return !!message.content.toLowerCase().startsWith(prefix + command);
    };

    if (isCommand('hamoud')) {
        const channel = message.member.voice.channel;
        if (!channel)
            return interaction.reply({ content: "⛔ Você deve estar em um canal de voz.", ephemeral: true })

        const player = createAudioPlayer();
        const resource = createAudioResource('sounds/hamoud.mp3')

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator
        })

        player.play(resource)
        connection.subscribe(player);
        message.channel.send("Tocando áudio!");

        inactivityConnDestroy()
    }
})

// Palmeiras
client.on('messageCreate', async message => {
    function isCommand(command) {
        return !!message.content.toLowerCase().startsWith(prefix + command);
    };

    if (isCommand('palmeiras')) {
        const channel = message.member.voice.channel;
        if (!channel)
            return interaction.reply({ content: "⛔ Você deve estar em um canal de voz.", ephemeral: true })

        const player = createAudioPlayer();
        const resource = createAudioResource('sounds/palmeiras.mp3')

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator
        })

        player.play(resource)
        connection.subscribe(player);
        message.channel.send("Tocando áudio!");

        inactivityConnDestroy()
    }
})

// Flamengo
client.on('messageCreate', async message => {
    function isCommand(command) {
        return !!message.content.toLowerCase().startsWith(prefix + command);
    };

    if (isCommand('flamengo')) {
        const channel = message.member.voice.channel;
        if (!channel)
            return interaction.reply({ content: "⛔ Você deve estar em um canal de voz.", ephemeral: true })

        const player = createAudioPlayer();
        const resource = createAudioResource('sounds/flamengo.mp3')

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator
        })

        player.play(resource)
        connection.subscribe(player);
        message.channel.send("Tocando áudio!");

        inactivityConnDestroy()
    }
})

module.exports = client;
