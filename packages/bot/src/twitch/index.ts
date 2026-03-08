import type { Client } from 'discord.js'
import { infoLog } from '@nexus/shared/utils'
import { featureToggleService } from '@nexus/shared/services'
import { isTwitchConfigured } from './token'
import { twitchEventSubClient } from './eventsubClient'

export async function startTwitchService(client: Client): Promise<void> {
    const enabled = await featureToggleService.isEnabled('TWITCH_NOTIFICATIONS')
    if (!enabled || !isTwitchConfigured()) {
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
