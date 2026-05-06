import { Player } from 'discord-player'
import type { BaseExtractor } from 'discord-player'
import {
    SoundCloudExtractor,
    AppleMusicExtractor,
    VimeoExtractor,
    AttachmentExtractor,
} from '@discord-player/extractor'
import { SpotifyExtractor } from 'discord-player-spotify'
import * as playdl from 'play-dl'
import type { CustomClient } from '../../types'
import { errorLog, infoLog, warnLog } from '@lucky/shared/utils'
import { createResilientStream } from './streamBridge'

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
    // Register all extractors asynchronously in priority order:
    //   Spotify → YouTube → SoundCloud → Apple Music → Vimeo → Attachments
    // Fire without awaiting so createPlayer() returns synchronously.
    registerExtractorsInOrder(player).catch((error) => {
        errorLog({
            message: 'Extractor init failed — music features degraded',
            error,
        })
    })
}

const registerExtractorsInOrder = async (player: Player): Promise<void> => {
    // 1. Spotify — first priority for searches and Spotify URLs
    await registerSpotifyExtractor(player)

    // 2. YouTube — via resilient yt-dlp bridge
    await initPlayDlSoundCloud()
    await loadYoutubeExtractor(player)

    // 3. SoundCloud, Apple Music, Vimeo, Attachments
    await registerRemainingExtractors(player)
}

const registerSpotifyExtractor = async (player: Player): Promise<void> => {
    try {
        const registered = await player.extractors.register(SpotifyExtractor, {
            clientId: process.env.SPOTIFY_CLIENT_ID ?? undefined,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? undefined,
            market: 'US',
        })
        if (!registered) {
            warnLog({
                message:
                    'SpotifyExtractor registration returned null — Spotify searches degraded',
            })
            return
        }
        infoLog({ message: 'Registered SpotifyExtractor (priority 1)' })
    } catch (error) {
        warnLog({
            message:
                'SpotifyExtractor failed to register — Spotify searches degraded',
            error,
        })
    }
}

const registerRemainingExtractors = async (player: Player): Promise<void> => {
    const extractors = [
        { extractor: SoundCloudExtractor, name: 'SoundCloud' },
        { extractor: AppleMusicExtractor, name: 'Apple Music' },
        { extractor: VimeoExtractor, name: 'Vimeo' },
        { extractor: AttachmentExtractor, name: 'Attachments' },
    ]

    for (const { extractor, name } of extractors) {
        try {
            const registered = await player.extractors.register(extractor, {})
            if (!registered) {
                warnLog({
                    message: `${name} extractor registration returned null`,
                })
            }
        } catch (error) {
            warnLog({ message: `${name} extractor failed to register`, error })
        }
    }

    infoLog({
        message: 'Registered: SoundCloud, Apple Music, Vimeo, Attachments',
    })
}

const initPlayDlSoundCloud = async (): Promise<void> => {
    try {
        const clientId = await playdl.getFreeClientID()
        await playdl.setToken({ soundcloud: { client_id: clientId } })
        infoLog({ message: 'play-dl: SoundCloud client ID initialized' })
    } catch (error) {
        warnLog({
            message:
                'play-dl: SoundCloud client ID init failed — bridge may not stream',
            error,
        })
    }
}

type YoutubeExtractorModule = {
    YoutubeExtractor?: typeof BaseExtractor<object>
    YoutubeiExtractor?: typeof BaseExtractor<object>
}

const loadYoutubeExtractor = async (player: Player): Promise<void> => {
    try {
        const mod = (await import(
            'discord-player-youtubei'
        )) as YoutubeExtractorModule

        // v3 renamed YoutubeiExtractor → YoutubeExtractor
        const YoutubeExtractor = mod.YoutubeExtractor ?? mod.YoutubeiExtractor
        if (!YoutubeExtractor) {
            warnLog({
                message:
                    'discord-player-youtubei: no extractor export found — skipping YouTube extractor',
            })
            return
        }

        const registered = await player.extractors.register(YoutubeExtractor, {
            createStream: createResilientStream,
        })

        if (!registered) {
            warnLog({
                message:
                    'YoutubeExtractor registration returned null — activation may have failed',
            })
            return
        }

        infoLog({
            message:
                'Registered YoutubeExtractor (SoundCloud bridge + YouTube fallback)',
        })
    } catch (error) {
        warnLog({
            message: 'YouTube extractor unavailable. Using SoundCloud/Spotify.',
            error,
        })
    }
}

export { streamViaYtDlp, streamViaYtDlpSearch, createResilientStream } from './streamBridge'
export { streamViaSoundCloud, findMatchingSoundCloudResult, parseDurationString } from './soundcloudMatcher'
