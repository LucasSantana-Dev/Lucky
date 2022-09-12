import { codeBlock } from '@discordjs/builders'

import client from '../index.js'
import prefix from '../config/prefix.js'

import data from '../config/data.js'

const commands = (command) => {
    client.on("messageCreate", async (message) => {
        const isCommand = (command) => {
            return message.content.toLowerCase() === (prefix + command);
        };

        if (isCommand("comandos")) {
            let comandos = `COMANDOS\n`
            for (let i = 0; i < data.length; i++) {
                comandos += `\n>${data[i].command} - ${data[i].function}`
            }
            message.channel.send(codeBlock(comandos));
        }
    })
}

export default commands;