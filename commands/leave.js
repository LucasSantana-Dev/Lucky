import { joinVoiceChannel } from '@discordjs/voice'
import { codeBlock } from '@discordjs/builders'

import client from '../index.js'
import prefix from '../config/prefix.js'

const leaveChannel = (command) => {
    client.on('messageCreate', async message => {
        const isCommand = (command) => {
            return message.content.toLowerCase() === (prefix + command);
        };

        if (isCommand('leave')) {
            const channel = message.member.voice.channel;
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator
            })
    
            if(!connection) return message.channel.send(codeBlock("🤨 Eu não estou em um canal de voz."));
            
            connection.destroy();
            message.channel.send(codeBlock("👋 Até mais!!"));
        }
    })
}

export default leaveChannel;
