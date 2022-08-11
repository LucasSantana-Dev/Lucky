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

const playAudio = require('./js/playAudio')

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
let snoreSound = 'sounds/snore.mp3'
playAudio.playAudio(snoreSound)

// Nyo
let nyoSound = 'sounds/nyo.mp3'
playAudio.playAudio(nyoSound)

// Hamoud
let hamoudSound = 'sounds/hamoud.mp3'
playAudio.playAudio(hamoudSound)

// Palmeiras
let palmeirasSound = 'sounds/palmeiras.mp3'
playAudio.playAudio(palmeirasSound)

// Flamengo
let flamengoSound = 'sounds/flamengo.mp3'
playAudio.playAudio(flamengoSound)

module.exports = client;
