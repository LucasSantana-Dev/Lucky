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
            getCategoryFromFilePath('src/functions/general/commands/ping.ts'),
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

    // #2475: several real music commands (artist, album, seek, nowplaying,
    // spotify, voteskip, ...) don't start with any prefix in
    // COMMAND_CATEGORIES.music.prefixes and were silently miscategorized as
    // 'general' by name-based matching alone. The command's own declared
    // `category` must win.
    it('trusts the command-declared category over name-prefix guessing', () => {
        expect(
            getCommandCategory({
                data: { name: 'artist' },
                category: 'music',
            } as never),
        ).toBe('music')
    })

    it('still falls back to name matching when no category is declared', () => {
        expect(
            getCommandCategory({
                data: { name: 'ping' },
            } as never),
        ).toBe('general')
    })
})

describe('getCategoryEmoji / getCategoryLabel', () => {
    it('return the configured emoji and label for music', () => {
        expect(getCategoryEmoji('music')).toBe('🎵')
        expect(getCategoryLabel('music')).toBe('🎵 Music')
    })
})
