import type { Player } from 'discord-player'
import type { CustomClient } from '../../types/index'
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

    player.events.removeAllListeners()

    setupErrorHandlers(player as unknown as { events: { on: (event: string, handler: Function) => void } })
    setupLifecycleHandlers(player as unknown as { events: { on: (event: string, handler: Function) => void } })
    setupTrackHandlers({ player: player as unknown as { events: { on: (event: string, handler: Function) => void } }, client })

    return player
}

export { lastPlayedTracks, recentlyPlayedTracks } from './trackHandlers'
export type { TrackHistoryEntry } from './trackHandlers'
