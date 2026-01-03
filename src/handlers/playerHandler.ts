import {
    createPlayerWithHandlers,
    lastPlayedTracks,
    recentlyPlayedTracks,
} from './player'
import type { CustomClient } from '../types/index'

type CreatePlayerParams = {
    client: CustomClient
}

export const createPlayer = ({ client }: CreatePlayerParams) => {
    return createPlayerWithHandlers({ client })
}

export { lastPlayedTracks, recentlyPlayedTracks }
