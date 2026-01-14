import { describe, it, expect } from '@jest/globals'
import { EMBED_COLORS, EMOJIS, type EmbedColor, type EmbedEmoji } from './constants'

describe('Embed Constants', () => {
    describe('EMBED_COLORS', () => {
        it('should have all required color constants', () => {
            expect(EMBED_COLORS.SUCCESS).toBe('#4CAF50')
            expect(EMBED_COLORS.ERROR).toBe('#F44336')
            expect(EMBED_COLORS.INFO).toBe('#2196F3')
            expect(EMBED_COLORS.WARNING).toBe('#FFC107')
            expect(EMBED_COLORS.NEUTRAL).toBe('#9E9E9E')
            expect(EMBED_COLORS.MUSIC).toBe('#9C27B0')
            expect(EMBED_COLORS.QUEUE).toBe('#3F51B5')
            expect(EMBED_COLORS.AUTOPLAY).toBe('#009688')
        })

        it('should have valid hex color format', () => {
            Object.values(EMBED_COLORS).forEach(color => {
                expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
            })
        })

        it('should have unique colors', () => {
            const colors = Object.values(EMBED_COLORS)
            const uniqueColors = new Set(colors)
            expect(uniqueColors.size).toBe(colors.length)
        })
    })

    describe('EMOJIS', () => {
        it('should have all required emoji constants', () => {
            expect(EMOJIS.SUCCESS).toBe('✅')
            expect(EMOJIS.ERROR).toBe('❌')
            expect(EMOJIS.INFO).toBe('ℹ️')
            expect(EMOJIS.WARNING).toBe('⚠️')
            expect(EMOJIS.NEUTRAL).toBe('⚪')
            expect(EMOJIS.MUSIC).toBe('🎵')
            expect(EMOJIS.AUDIO).toBe('🎧')
            expect(EMOJIS.VIDEO).toBe('🎥')
            expect(EMOJIS.QUEUE).toBe('📋')
            expect(EMOJIS.AUTOPLAY).toBe('🔄')
            expect(EMOJIS.PLAY).toBe('▶️')
            expect(EMOJIS.PAUSE).toBe('⏸️')
            expect(EMOJIS.STOP).toBe('⏹️')
            expect(EMOJIS.SKIP).toBe('⏭️')
            expect(EMOJIS.VOLUME).toBe('🔊')
            expect(EMOJIS.LOOP).toBe('🔁')
            expect(EMOJIS.SHUFFLE).toBe('🔀')
            expect(EMOJIS.DOWNLOAD).toBe('⬇️')
            expect(EMOJIS.SETTINGS).toBe('⚙️')
            expect(EMOJIS.EXIT).toBe('🚪')
        })

        it('should have valid emoji format', () => {
            Object.values(EMOJIS).forEach(emoji => {
                expect(typeof emoji).toBe('string')
                expect(emoji.length).toBeGreaterThan(0)
            })
        })

        it('should have unique emojis', () => {
            const emojis = Object.values(EMOJIS)
            const uniqueEmojis = new Set(emojis)
            expect(uniqueEmojis.size).toBe(emojis.length)
        })
    })

    describe('Type definitions', () => {
        it('should have correct EmbedColor type', () => {
            const color: EmbedColor = EMBED_COLORS.SUCCESS
            expect(color).toBe('#4CAF50')
        })

        it('should have correct EmbedEmoji type', () => {
            const emoji: EmbedEmoji = EMOJIS.SUCCESS
            expect(emoji).toBe('✅')
        })
    })

    describe('Color categories', () => {
        it('should have success colors', () => {
            expect(EMBED_COLORS.SUCCESS).toBeDefined()
        })

        it('should have error colors', () => {
            expect(EMBED_COLORS.ERROR).toBeDefined()
        })

        it('should have info colors', () => {
            expect(EMBED_COLORS.INFO).toBeDefined()
        })

        it('should have warning colors', () => {
            expect(EMBED_COLORS.WARNING).toBeDefined()
        })

        it('should have neutral colors', () => {
            expect(EMBED_COLORS.NEUTRAL).toBeDefined()
        })

        it('should have music-related colors', () => {
            expect(EMBED_COLORS.MUSIC).toBeDefined()
            expect(EMBED_COLORS.QUEUE).toBeDefined()
            expect(EMBED_COLORS.AUTOPLAY).toBeDefined()
        })
    })

    describe('Emoji categories', () => {
        it('should have status emojis', () => {
            expect(EMOJIS.SUCCESS).toBeDefined()
            expect(EMOJIS.ERROR).toBeDefined()
            expect(EMOJIS.INFO).toBeDefined()
            expect(EMOJIS.WARNING).toBeDefined()
            expect(EMOJIS.NEUTRAL).toBeDefined()
        })

        it('should have music control emojis', () => {
            expect(EMOJIS.PLAY).toBeDefined()
            expect(EMOJIS.PAUSE).toBeDefined()
            expect(EMOJIS.STOP).toBeDefined()
            expect(EMOJIS.SKIP).toBeDefined()
            expect(EMOJIS.VOLUME).toBeDefined()
            expect(EMOJIS.LOOP).toBeDefined()
            expect(EMOJIS.SHUFFLE).toBeDefined()
        })

        it('should have media emojis', () => {
            expect(EMOJIS.MUSIC).toBeDefined()
            expect(EMOJIS.AUDIO).toBeDefined()
            expect(EMOJIS.VIDEO).toBeDefined()
        })

        it('should have action emojis', () => {
            expect(EMOJIS.QUEUE).toBeDefined()
            expect(EMOJIS.AUTOPLAY).toBeDefined()
            expect(EMOJIS.DOWNLOAD).toBeDefined()
            expect(EMOJIS.SETTINGS).toBeDefined()
            expect(EMOJIS.EXIT).toBeDefined()
        })
    })
})
