import { codeBlock } from '@discordjs/builders'

import client from '../index.js'
import prefix from '../config/prefix.js'

import { joinVoiceChannel, createAudioResource, createAudioPlayer } from '@discordjs/voice'

const playAudio = (audio, command) => {
    client.on('messageCreate', async message => {
        const isCommand = (commandMsg) => {
            return message.content.toLowerCase() === (prefix + commandMsg);
        };
        
        if (isCommand(command)) {
            const channel = message.member.voice.channel;
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator
            })

            const player = createAudioPlayer();
            const resource = createAudioResource(audio)

            player.play(resource)
            connection.subscribe(player);
            message.channel.send(codeBlock("🔊 Tocando áudio!"));
        }
    })
}

export default playAudio;