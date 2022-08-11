const { Client, Intents } = require('discord.js')
const client = new Client({
    intents: [Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_VOICE_STATES]
})
const { joinVoiceChannel, createAudioResource } = require('@discordjs/voice');
const { createAudioPlayer } = require('@discordjs/voice')
const innactivityChecker = require('./inactivityChecker')

// Play Audio Function
function playAudio(audio){
    client.on('messageCreate', async message => {
        function isCommand(command) {
            return !!message.content.toLowerCase().startsWith(prefix + command);
        };
    
        if (isCommand('sleep')) {
            const channel = message.member.voice.channel;
            if (!channel)
                return interaction.reply({ content: "⛔ Você deve estar em um canal de voz.", ephemeral: true })
    
            const player = createAudioPlayer();
            const resource = createAudioResource(audio)
    
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator
            })
    
            player.play(resource)
            connection.subscribe(player);
            message.channel.send("Tocando áudio!");
    
            inactivityConnDestroy(connection, player)
        }
    })
}

export function playAudio(audio);