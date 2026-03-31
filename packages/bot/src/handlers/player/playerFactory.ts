import { Player } from 'discord-player'
import { DefaultExtractors } from '@discord-player/extractor'
import type { CustomClient } from '../../types'
import { errorLog, infoLog, warnLog } from '@lucky/shared/utils'

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
    void player.extractors.loadMulti(DefaultExtractors)

    void loadYoutubeExtractor(player)

    infoLog({
        message:
            'Extractors: SoundCloud, Spotify, Apple Music, Vimeo, Attachments',
    })
}

const loadYoutubeExtractor = async (player: Player): Promise<void> => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = (await import('discord-player-youtubei')) as any

        await player.extractors.register(mod.YoutubeiExtractor, {
            streamOptions: {
                useClient: 'IOS' as const,
                highWaterMark: 1 << 25,
            },
            generateWithPoToken: true,
        })

        infoLog({
            message: 'Registered YoutubeiExtractor (native IOS client)',
        })
    } catch {
        warnLog({
            message: 'YouTube extractor unavailable. Using SoundCloud/Spotify.',
        })
    }
}
