import type { Client } from 'discord.js'
import { infoLog } from '@lucky/shared/utils'
import {
    featureToggleService,
    twitchControlService,
} from '@lucky/shared/services'
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
        // Re-subscribe when the web dashboard adds/removes a channel: the
        // backend writes Postgres then publishes a refresh signal, so the
        // running session reflects the change without a restart (#870).
        await twitchControlService.connect()
        if (twitchControlService.isHealthy()) {
            await twitchControlService.subscribeToRefresh(
                refreshTwitchSubscriptions,
            )
        }
    } catch (err) {
        infoLog({
            message: 'Twitch EventSub service failed to start (non-fatal)',
            data: err,
        })
    }
}

export function stopTwitchService(): void {
    twitchEventSubClient.stop()
    void twitchControlService.disconnect()
}

export async function refreshTwitchSubscriptions(): Promise<void> {
    await twitchEventSubClient.refreshSubscriptions()
}
