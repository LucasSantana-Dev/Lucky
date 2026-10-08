import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// #2740: Spotify tracks must reach the bridge through discord-player's
// onBeforeCreateStream hook, registered when the player is created and before
// any queue exists (the hook is read at queue creation).
const onBeforeCreateStreamMock = jest.fn()
const order: string[] = []

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    warnLog: jest.fn(),
    errorLog: jest.fn(),
}))
jest.mock('./extractorHealth', () => ({ setExtractorDegraded: jest.fn() }))
jest.mock('./soundcloudMatcher', () => ({
    refreshSoundCloudClientId: jest.fn(async () => undefined),
}))
jest.mock('./resilientStreamBridge', () => ({
    createResilientStream: jest.fn(),
    streamSpotifyTrackViaBridge: jest.fn(),
}))
jest.mock('discord-player-spotify', () => ({ SpotifyExtractor: class {} }))
jest.mock('@discord-player/extractor', () => ({
    SoundCloudExtractor: class {},
    AppleMusicExtractor: class {},
    VimeoExtractor: class {},
    AttachmentExtractor: class {},
}))
jest.mock('discord-player-youtubei', () => ({ YoutubeExtractor: class {} }))
jest.mock('discord-player', () => ({
    Player: class {
        extractors = { register: jest.fn(async () => true) }
        constructor() {
            order.push('Player')
        }
        setMaxListeners() {}
    },
    onBeforeCreateStream: (...args: unknown[]) => {
        order.push('hook')
        return onBeforeCreateStreamMock(...args)
    },
}))

import { createPlayer } from './playerFactory'
import { streamSpotifyTrackViaBridge } from './resilientStreamBridge'

describe('createPlayer Spotify bridge hook', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        order.length = 0
    })

    it('registers the Spotify bridge hook before constructing the player', () => {
        createPlayer({ client: {} as never })

        expect(onBeforeCreateStreamMock).toHaveBeenCalledTimes(1)
        expect(onBeforeCreateStreamMock).toHaveBeenCalledWith(
            streamSpotifyTrackViaBridge,
        )
        expect(order).toEqual(['hook', 'Player'])
    })
})
