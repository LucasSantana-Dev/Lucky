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

let dennyCount = 575

// Ping Pong
client.on("messageCreate", (message) => {
    if (message.content.startsWith("Ping")) {
        message.channel.send("Pong!");
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
        if (!channel)
            return interaction.reply({ content: "⛔ Eu não estou em um canal de voz.", ephemeral: true })

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator
        })

        connection.destroy();
        message.channel.send("Até mais!!")
    }
})

// Play Audio Function
const playAudio = (audio, command) => {
    client.on('messageCreate', async message => {
        function isCommand(commandMsg) {
            return !!message.content.toLowerCase().startsWith(prefix + commandMsg);
        };

        if (isCommand(command)) {
            const channel = message.member.voice.channel;
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator
            })

            if (!channel)
                return interaction.reply({ content: "⛔ Você deve estar em um canal de voz.", ephemeral: true })

            const player = createAudioPlayer();
            const resource = createAudioResource(audio)

            

            player.play(resource)
            connection.subscribe(player);
            message.channel.send("Tocando áudio!");
        }
    })
}

// Denny Count
let dennyCommand = 'denny'
client.on('messageCreate', async message => {
    function isCommand(command) {
        return !!message.content.toLowerCase().startsWith(prefix + command);
    };

    if (isCommand(dennyCommand)) {
        dennyCount++
        message.channel.send(`O ${dennyCommand} já foi incel ${dennyCount} vezes. `)
    }
})

// Snore
let snoreCommand = 'sleep'
let snoreSound = './sounds/snore.mp3'
playAudio(snoreSound, snoreCommand)

// Nyo
let nyoCommand = 'nyo'
let nyoSound = './sounds/nyo.mp3'
playAudio(nyoSound, nyoCommand)

// Hamoud
let hamoudCommand = 'hamoud'
let hamoudSound = './sounds/hamoud.mp3'
playAudio(hamoudSound, hamoudCommand)


// Palmeiras
let palmeirasCommand = 'palmeiras'
let palmeirasSound = './sounds/palmeiras.mp3'
playAudio(palmeirasSound, palmeirasCommand)

// Flamengo
let flamengoCommand = 'flamengo'
let flamengoSound = './sounds/flamengo.mp3'
playAudio(flamengoSound, flamengoCommand)