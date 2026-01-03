import { describe, it, expect } from '@jest/globals'
import { messages } from './messages'

describe('Messages', () => {
    describe('error messages', () => {
        it('should have guildOnly error message', () => {
            expect(messages.error.guildOnly).toBe('👥 This command can only be used in a server!')
        })

        it('should have voiceChannel error message', () => {
            expect(messages.error.voiceChannel).toBe('🔈 You need to be in a voice channel!')
        })

        it('should have noQueue error message', () => {
            expect(messages.error.noQueue).toBe("🤔 There's no music playing at the moment.")
        })

        it('should have noTrack error message', () => {
            expect(messages.error.noTrack).toBe('No music is currently playing!')
        })

        it('should have notPlaying error message', () => {
            expect(messages.error.notPlaying).toBe("🤔 There's no music playing at the moment.")
        })

        it('should have volumeRange error message', () => {
            expect(messages.error.volumeRange).toBe('🔊 Volume must be between 1 and 100!')
        })

        it('should have noQuery error message', () => {
            expect(messages.error.noQuery).toBe('❌ You need to provide a search term or URL.')
        })

        it('should have noResult error message', () => {
            expect(messages.error.noResult).toBe('❌ No results found.')
        })

        it('should have generic error message', () => {
            expect(messages.error.generic).toBe('❌ An error occurred while processing your request.')
        })

        it('should have downloadFailed error message', () => {
            expect(messages.error.downloadFailed).toBe('❌ Failed to download content.')
        })

        it('should have invalidOption error message', () => {
            expect(messages.error.invalidOption).toBe('❌ Invalid option.')
        })

        it('should have nonHandledError error message', () => {
            expect(messages.error.nonHandledError).toBe('❌ An unhandled error occurred. Please try again later.')
        })
    })

    describe('success messages', () => {
        it('should generate volumeSet message with value', () => {
            const result = messages.success.volumeSet(50)
            expect(result).toBe('🔊 Volume set to 50%')
        })

        it('should generate volumeSet message with different values', () => {
            expect(messages.success.volumeSet(0)).toBe('🔊 Volume set to 0%')
            expect(messages.success.volumeSet(100)).toBe('🔊 Volume set to 100%')
            expect(messages.success.volumeSet(75)).toBe('🔊 Volume set to 75%')
        })

        it('should generate currentVolume message with value', () => {
            const result = messages.success.currentVolume(25)
            expect(result).toBe('🔊 Volume is at 25%')
        })

        it('should generate currentVolume message with different values', () => {
            expect(messages.success.currentVolume(0)).toBe('🔊 Volume is at 0%')
            expect(messages.success.currentVolume(100)).toBe('🔊 Volume is at 100%')
            expect(messages.success.currentVolume(33)).toBe('🔊 Volume is at 33%')
        })
    })

    describe('message structure', () => {
        it('should have error and success properties', () => {
            expect(messages).toHaveProperty('error')
            expect(messages).toHaveProperty('success')
        })

        it('should have all required error properties', () => {
            const errorKeys = Object.keys(messages.error)
            const expectedKeys = [
                'guildOnly',
                'voiceChannel',
                'noQueue',
                'noTrack',
                'notPlaying',
                'volumeRange',
                'noQuery',
                'noResult',
                'generic',
                'downloadFailed',
                'invalidOption',
                'nonHandledError'
            ]

            expectedKeys.forEach(key => {
                expect(errorKeys).toContain(key)
            })
        })

        it('should have all required success properties', () => {
            const successKeys = Object.keys(messages.success)
            const expectedKeys = ['volumeSet', 'currentVolume']

            expectedKeys.forEach(key => {
                expect(successKeys).toContain(key)
            })
        })

        it('should have functions for success messages', () => {
            expect(typeof messages.success.volumeSet).toBe('function')
            expect(typeof messages.success.currentVolume).toBe('function')
        })
    })
})
