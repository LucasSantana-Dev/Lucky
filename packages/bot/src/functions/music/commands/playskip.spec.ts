import { beforeEach, describe, expect, it, jest } from '@jest/globals'

// Mock dependencies before importing the command
jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: jest.fn(),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createErrorEmbed: jest.fn(),
    errorEmbed: jest.fn(),
}))

jest.mock('../../../utils/music/nowPlayingEmbed', () => ({
    buildPlayResponseEmbed: jest.fn(),
}))

jest.mock('../../../utils/music/buttonComponents', () => ({
    createMusicControlButtons: jest.fn(),
}))

jest.mock('../../../utils/music/queueResolver', () => ({
    resolveGuildQueue: jest.fn(),
}))

jest.mock('../../../utils/general/errorSanitizer', () => ({
    createUserFriendlyError: jest.fn(),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireVoiceChannel: jest.fn(),
    requireGuild: jest.fn(),
    requireQueue: jest.fn(),
    requireCurrentTrack: jest.fn(),
    requireIsPlaying: jest.fn(),
    requireInteractionOptions: jest.fn(),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
    createUserErrorMessage: jest.fn(),
    handleError: jest.fn(),
}))

import playSkipCommand from './playskip'

describe('playskip command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should have correct command structure', () => {
        expect(playSkipCommand.data.name).toBe('playskip')
        expect(playSkipCommand.category).toBe('music')
        expect(playSkipCommand.execute).toBeDefined()
    })

    it('should have query string option', () => {
        const options = playSkipCommand.data.options
        const queryOption = options.find((opt: any) => opt.name === 'query')
        expect(queryOption).toBeDefined()
        expect(queryOption?.required).toBe(true)
    })
})
