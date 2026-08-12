import { describe, it, expect } from '@jest/globals'
import {
    getCategoryFromCommandName,
    getCategoryFromFilePath,
    getCommandCategory,
    getCategoryEmoji,
    getCategoryLabel,
} from './commandCategory'

describe('getCategoryFromFilePath', () => {
    it('returns the category directory when it is a recognized category', () => {
        expect(
            getCategoryFromFilePath('src/functions/music/commands/play.ts'),
        ).toBe('music')
        expect(
            getCategoryFromFilePath(
                'src/functions/general/commands/ping.ts',
            ),
        ).toBe('general')
    })

    it('falls back to command-name matching for an unrecognized directory', () => {
        expect(
            getCategoryFromFilePath(
                'src/functions/moderation/commands/xyz123.ts',
            ),
        ).toBe('general')
    })

    it('falls back to command-name matching when there is no functions segment', () => {
        expect(getCategoryFromFilePath('src/commands/play.ts')).toBe('music')
    })
})

describe('getCategoryFromCommandName', () => {
    it('matches a known prefix', () => {
        expect(getCategoryFromCommandName('play')).toBe('music')
    })

    it('defaults to general for an unmatched name', () => {
        expect(getCategoryFromCommandName('unknown')).toBe('general')
    })
})

describe('getCommandCategory', () => {
    it('resolves from the command data name', () => {
        expect(
            getCommandCategory({
                data: { name: 'play' },
            } as never),
        ).toBe('music')
    })

    it('defaults to general when command data is missing', () => {
        expect(getCommandCategory({} as never)).toBe('general')
    })
})

describe('getCategoryEmoji / getCategoryLabel', () => {
    it('return the configured emoji and label for music', () => {
        expect(getCategoryEmoji('music')).toBe('🎵')
        expect(getCategoryLabel('music')).toBe('🎵 Music')
    })
})
