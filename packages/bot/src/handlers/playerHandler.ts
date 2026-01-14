import type { Player } from 'discord-player'
import type { CustomClient } from '../types/index'
import { createPlayerWithHandlers } from './player'

interface ICreatePlayerParams {
    client: CustomClient
}

export const createPlayer = ({ client }: ICreatePlayerParams): Player => {
    return createPlayerWithHandlers({ client })
}

export { lastPlayedTracks, recentlyPlayedTracks } from './player'
export type { TrackHistoryEntry } from './player'
