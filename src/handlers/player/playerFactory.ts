import { Player } from 'discord-player'
import {
    AttachmentExtractor,
    SpotifyExtractor,
    SoundCloudExtractor,
} from '@discord-player/extractor'
import { YtDlpExtractor } from '../../utils/music/ytdlpExtractor'
import type { CustomClient } from '../../types/index'
import type { PlayerExtractors } from '../../types/discord'
import { errorLog, infoLog, debugLog } from '../../utils/general/log'

type CreatePlayerParams = {
    client: CustomClient
}

export const createPlayer = ({ client }: CreatePlayerParams): Player => {
    try {
        infoLog({ message: 'Creating player...' })

        const player = new Player(client)
        registerExtractors(player)

        infoLog({ message: 'Player created successfully' })
        return player
    } catch (error) {
        errorLog({ message: 'Error creating player:', error })
        throw error
    }
}

const registerExtractors = (player: Player): void => {
    try {
        debugLog({ message: 'Attempting to register extractors...' })

        // Use selective extractor loading for better performance
        const extractorsToLoad = [
            AttachmentExtractor,
            SpotifyExtractor,
            SoundCloudExtractor
        ]

        // Load extractors selectively to reduce memory usage
        void player.extractors.loadMulti(extractorsToLoad)

        // Register custom yt-dlp extractor
        registerYtDlpExtractor(player)

        // Set max listeners to prevent memory leaks
        player.setMaxListeners(20)

        infoLog({ message: 'Successfully registered extractors with selective loading' })
    } catch (error) {
        errorLog({ message: 'Error registering extractors:', error })
    }
}

const registerYtDlpExtractor = (player: Player): void => {
    try {
        void (player.extractors as PlayerExtractors).register(YtDlpExtractor as unknown as { name: string; validate: (url: string) => boolean; extract: (url: string) => Promise<unknown> }, {})
        infoLog({
            message: 'Successfully registered yt-dlp-based YouTube extractor',
        })
    } catch (ytdlpError) {
        errorLog({
            message: 'Failed to register yt-dlp extractor:',
            error: ytdlpError,
        })
    }
}
