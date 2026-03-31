import type { Client } from 'discord.js'
import chalk from 'chalk'
import { infoLog } from '@lucky/shared/utils'
import type { CustomClient } from '../types'
import { restoreSessionsOnStartup } from '../utils/music/sessionStartupRestore'
import { musicWatchdogService } from '../utils/music/watchdog'
import { resolveGuildQueue } from '../utils/music/queueResolver'
import { aiDevToolkitService } from '../services/AiDevToolkitService'

export const name = 'clientReady'
export const once = true

export async function execute(client: Client): Promise<void> {
    infoLog({ message: `Logged in as ${chalk.white(client.user?.tag)}!` })
    infoLog({ message: `Bot is active in ${client.guilds.cache.size} guilds` })
    infoLog({ message: `Connection status: ${client.ws.status}` })

    client.guilds.cache.forEach((guild) => {
        infoLog({ message: `Connected to guild: ${guild.name} (${guild.id})` })
    })

    await restoreSessionsOnStartup(client as CustomClient)

    musicWatchdogService.startPeriodicScan((guildId) => {
        const { queue } = resolveGuildQueue(client as CustomClient, guildId)
        return queue ?? null
    })

    if (process.env.AI_DEV_TOOLKIT_BOARD_ENABLED === 'true') {
        await aiDevToolkitService.start(client)
    }
}
