import type { Client } from "discord.js"
import chalk from "chalk"
import { infoLog } from "../utils/general/log"

export const name = "ready"
export const once = true

export function execute(client: Client): void {
    infoLog({ message: `Logged in as ${chalk.white(client.user?.tag)}!` })
    infoLog({ message: `Bot is active in ${client.guilds.cache.size} guilds` })
    infoLog({ message: `Connection status: ${client.ws.status}` })

    client.guilds.cache.forEach((guild) => {
        infoLog({ message: `Connected to guild: ${guild.name} (${guild.id})` })
    })
}
