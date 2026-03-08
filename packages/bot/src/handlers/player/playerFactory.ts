import { Player } from 'discord-player'
import { DefaultExtractors } from '@discord-player/extractor'
import type { CustomClient } from '../../types'
import { errorLog, infoLog } from '@nexus/shared/utils'

type CreatePlayerParams = {
    client: CustomClient
}

export const createPlayer = ({ client }: CreatePlayerParams): Player => {
    try {
        infoLog({ message: 'Creating player...' })

        const player = new Player(client)
        registerExtractors(player)

        player.setMaxListeners(20)

        infoLog({ message: 'Player created successfully' })
        return player
    } catch (error) {
        errorLog({ message: 'Error creating player:', error })
        throw error
    }
}

const registerExtractors = (player: Player): void => {
    try {
        void player.extractors.loadMulti(DefaultExtractors)

        infoLog({
            message:
                'Registered default extractors (SoundCloud, Spotify, Apple Music, Vimeo, Attachments)',
        })
    } catch (error) {
        errorLog({ message: 'Error registering extractors:', error })
    }
}
