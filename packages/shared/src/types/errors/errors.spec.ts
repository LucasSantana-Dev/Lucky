import { describe, it, expect } from '@jest/globals'
import { MusicError, ConfigurationError } from './index'

describe('Error Types', () => {
    describe('MusicError', () => {
        it('should create a MusicError with message', () => {
            const error = new MusicError('Music failed')
            expect(error.message).toBe('Music failed')
            expect(error.name).toBe('MusicError')
        })

        it('should create a MusicError with code', () => {
            const error = new MusicError('Music failed', 'ERR_MUSIC_TRACK_NOT_FOUND')
            expect(error.message).toBe('Music failed')
            expect(error.code).toBe('ERR_MUSIC_TRACK_NOT_FOUND')
        })

        it('should create a MusicError with metadata', () => {
            const error = new MusicError('Music failed', 'ERR_MUSIC_TRACK_NOT_FOUND', {
                correlationId: 'test-123',
                userId: 'user-123',
                guildId: 'guild-123'
            })
            expect(error.metadata.correlationId).toBe('test-123')
            expect(error.metadata.userId).toBe('user-123')
            expect(error.metadata.guildId).toBe('guild-123')
        })
    })

    describe('ConfigurationError', () => {
        it('should create a ConfigurationError', () => {
            const error = new ConfigurationError('Config failed')
            expect(error.message).toBe('Config failed')
            expect(error.name).toBe('ConfigurationError')
        })
    })

    describe('Error inheritance', () => {
        it('should inherit from Error', () => {
            const error = new MusicError('Test')
            expect(error instanceof Error).toBe(true)
        })

        it('should have correct prototype chain', () => {
            const error = new MusicError('Test')
            expect(error instanceof MusicError).toBe(true)
            expect(error instanceof Error).toBe(true)
        })
    })
})
