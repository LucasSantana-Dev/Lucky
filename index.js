const { Client, Intents } = require('discord.js')
const client = new Client({ intents: 32767 })
const { joinVoiceChannel, createAudioResource } = require('@discordjs/voice');
const { createAudioPlayer } = require('@discordjs/voice')
const prefix = '!'
const config = require('./config.json')
const token = config.token;

client.login(token)

client.once("ready", () => {
    console.log("The bot is now online!");
    client.user.setActivity("Online", {type: "WATCHING"})
})
// Ping Pong
client.on("messageCreate", (message) => {
    if (message.content.startsWith("ping")) {
        message.channel.send("pong!");
    }
});
// Snore
client.on('messageCreate', async message => {
    function isCommand(command) {
        return !!message.content.toLowerCase().startsWith(prefix + command);
    };

    if (isCommand('sleep')) {
        const channel = message.member.voice.channel;
        if (!channel) 
        return interaction.reply({content: "⛔ Você deve estar em um canal.", ephemeral: true})

        const player = createAudioPlayer();
        const resource = createAudioResource('D:/Programação/Projetos/SleepBot/snore.mp3')

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator
        })

        player.play(resource, {volume: 0.1})
        connection.subscribe(player);

        const subscription = connection.subscribe(player);
        if (subscription) {
            // Unsubscribe after 5 seconds (stop playing audio on the voice connection)
            setTimeout(() => subscription.unsubscribe(), 5_000);
        }
    }
})

module.exports = client;