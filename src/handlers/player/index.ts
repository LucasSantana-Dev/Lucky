import type { Player } from 'discord-player'
import type { CustomClient } from '../../types/index'
import type { PlayerEvents } from '../../types/discord'
import { createPlayer } from './playerFactory'
import { setupErrorHandlers } from './errorHandlers'
import { setupLifecycleHandlers } from './lifecycleHandlers'
import { setupTrackHandlers } from './trackHandlers'

type CreatePlayerParams = {
    client: CustomClient
}

export const createPlayerWithHandlers = ({
    client,
}: CreatePlayerParams): Player => {
    const player = createPlayer({ client })

    // Setup event handlers
    setupErrorHandlers(player as PlayerEvents)
    setupLifecycleHandlers(player as PlayerEvents)
    setupTrackHandlers(player as PlayerEvents)

    return player
}

export { lastPlayedTracks, recentlyPlayedTracks } from './trackHandlers'
export type { TrackHistoryEntry } from './trackHandlers'
