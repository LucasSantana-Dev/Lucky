import * as dotenv from 'dotenv'
dotenv.config()
import { Client, Intents } from 'discord.js'

const client = new Client({
    intents: [Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_VOICE_STATES]
})

const token = process.env.DISCORD_TOKEN;

export default client;

// Import Functions
import playAudio from './commands/playAudio.js'
import commands from './commands/commands.js.js'
import leaveChannel from './commands/leave.js.js'

// Import commands data
import data from './config/data.js'

client.login(token)

client.once("ready", () => {
    console.log("O LukBot está online e roteando, bebês!!");
    client.user.setActivity("Online e roteando!", { type: "WATCHING" })
})

// Snore
let snoreCommand = data.filter((command) => command.name === 'Sleep')[0]
playAudio(snoreCommand.audio, snoreCommand.command)

// Nyo
let nyoCommand = data.filter((command) => command.name === 'Nyo')[0]
playAudio(nyoCommand.audio, nyoCommand.command)

// Hamoud
let hamoudCommand = data.filter((command) => command.name === 'Hamoud')[0]
playAudio(hamoudCommand.audio, hamoudCommand.command)


// Palmeiras
let palmeirasCommand = data.filter((command) => command.name === 'Palmeiras')[0]
playAudio(palmeirasCommand.audio, palmeirasCommand.command)

// Flamengo
let flamengoCommand = data.filter((command) => command.name === 'Flamengo')[0]
playAudio(flamengoCommand.audio, flamengoCommand.command)

// Brasil
let brasilCommand = data.filter((command) => command.name === 'Brasil')[0]
playAudio(brasilCommand.audio, brasilCommand.command)

// Brasil
let atumalacaCommand = data.filter((command) => command.name === 'Atumalaca')[0]
playAudio(atumalacaCommand.audio, atumalacaCommand.command)

// Commands
let helpCommand = "comandos"
commands(helpCommand)

//Leave
let leaveCommand = "leave"
leaveChannel(leaveCommand)