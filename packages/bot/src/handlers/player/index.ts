import type { Player } from 'discord-player'
import type { CustomClient } from '../../types'
import { createPlayer } from './playerFactory'
import { setupErrorHandlers } from './errorEventHandlers'
import {
    setupLifecycleHandlers,
    setupStageSpeaker,
    setupVoiceKickDetection,
} from './lifecycleHandlers'
import { setupTrackHandlers } from './trackEventHandlers'

type CreatePlayerParams = {
    client: CustomClient
}

export const createPlayerWithHandlers = ({
    client,
}: CreatePlayerParams): Player => {
    const player = createPlayer({ client })

    player.events.removeAllListeners()

    setupErrorHandlers(
        player as unknown as {
            events: { on: (event: string, handler: Function) => void }
        },
    )
    setupLifecycleHandlers(
        player as unknown as {
            events: { on: (event: string, handler: Function) => void }
        },
    )
    setupTrackHandlers({
        player: player as unknown as {
            events: { on: (event: string, handler: Function) => void }
        },
        client,
    })
    setupVoiceKickDetection(client)
    setupStageSpeaker(client)

    return player
}

export { lastPlayedTracks, recentlyPlayedTracks } from './trackHistoryCache'
export type { TrackHistoryEntry } from './trackHistoryCache'
