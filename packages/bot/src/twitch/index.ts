import type { Client } from 'discord.js'
import { infoLog } from '@lukbot/shared/utils'
import { isTwitchConfigured } from './token'
import { twitchEventSubClient } from './eventsubClient'

export async function startTwitchService(client: Client): Promise<void> {
  if (!isTwitchConfigured()) {
    return
  }
  try {
    await twitchEventSubClient.start(client)
    infoLog({ message: 'Twitch EventSub service started' })
  } catch (err) {
    infoLog({
      message: 'Twitch EventSub service failed to start (non-fatal)',
      data: err,
    })
  }
}

export function stopTwitchService(): void {
  twitchEventSubClient.stop()
}

export async function refreshTwitchSubscriptions(): Promise<void> {
  await twitchEventSubClient.refreshSubscriptions()
}
