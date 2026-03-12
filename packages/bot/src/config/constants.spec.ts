import { describe, expect, it } from '@jest/globals'
import { COMMAND_CATEGORIES } from './constants'

describe('COMMAND_CATEGORIES', () => {
    it('declares all supported command categories', () => {
        expect(Object.keys(COMMAND_CATEGORIES).sort()).toEqual(
            ['automod', 'download', 'general', 'management', 'moderation', 'music'].sort(),
        )
        expect(COMMAND_CATEGORIES.management.prefixes).toContain('guildconfig')
        expect(COMMAND_CATEGORIES.management.prefixes).toContain('serversetup')
        expect(COMMAND_CATEGORIES.automod.prefixes).toEqual(['automod'])
    })
})
