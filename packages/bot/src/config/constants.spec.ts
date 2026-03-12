import { describe, expect, it } from '@jest/globals'
import { COMMAND_CATEGORIES } from './constants'

describe('COMMAND_CATEGORIES', () => {
    it('declares all supported command categories', () => {
        const byName = (a: string, b: string) => a.localeCompare(b)
        expect(Object.keys(COMMAND_CATEGORIES).sort(byName)).toEqual(
            ['automod', 'download', 'general', 'management', 'moderation', 'music'].sort(byName),
        )
        expect(COMMAND_CATEGORIES.management.prefixes).toContain('guildconfig')
        expect(COMMAND_CATEGORIES.management.prefixes).toContain('serversetup')
        expect(COMMAND_CATEGORIES.automod.prefixes).toEqual(['automod'])
    })
})
