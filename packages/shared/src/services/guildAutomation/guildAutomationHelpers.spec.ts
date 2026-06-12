import { describe, it, expect, jest, afterEach } from '@jest/globals'
import { toManifestDocument } from './guildAutomationHelpers'
import * as log from '../../utils/general/log'

// Mock the errorLog function
jest.mock('../../utils/general/log', () => ({
    errorLog: jest.fn(),
}))

describe('guildAutomationHelpers', () => {
    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('toManifestDocument', () => {
        it('parses a valid manifest document', () => {
            const validManifest = {
                version: 1,
                guild: {
                    id: '123456789012345678',
                    name: 'Test Guild',
                },
                source: 'manual',
            }

            const result = toManifestDocument(validManifest)

            expect(result.version).toBe(1)
            expect(result.guild.id).toBe('123456789012345678')
        })

        it('throws on malformed manifest JSON (missing required guild field)', () => {
            const malformedManifest = {
                version: 1,
            }

            expect(() => toManifestDocument(malformedManifest)).toThrow(
                'Invalid manifest',
            )
            expect(log.errorLog).toHaveBeenCalled()
        })

        it('throws on invalid guild snowflake', () => {
            const invalidGuildId = {
                version: 1,
                guild: {
                    id: 'not-a-snowflake',
                    name: 'Test Guild',
                },
            }

            expect(() => toManifestDocument(invalidGuildId)).toThrow(
                'Invalid manifest',
            )
            expect(log.errorLog).toHaveBeenCalled()
        })

        it('throws when value is not an object', () => {
            expect(() => toManifestDocument('not an object')).toThrow(
                'Manifest payload is invalid',
            )
        })

        it('throws when value is null', () => {
            expect(() => toManifestDocument(null)).toThrow(
                'Manifest payload is invalid',
            )
        })

        it('throws when value is an array', () => {
            expect(() => toManifestDocument([1, 2, 3])).toThrow(
                'Manifest payload is invalid',
            )
        })

        it('logs validation errors with path and message', () => {
            const malformedManifest = {
                version: 1,
                guild: {
                    id: '999', // Too short for snowflake
                    name: 'Test Guild',
                },
            }

            expect(() => toManifestDocument(malformedManifest)).toThrow()

            expect(log.errorLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Failed to parse GuildAutomationManifest JSON',
                    error: expect.any(Array),
                }),
            )

            const errorCall = (log.errorLog as jest.Mock).mock.calls[0]?.[0] as {
                error: Array<{ path: string; message: string; code: string }>
            }
            expect(errorCall.error).toBeInstanceOf(Array)
            expect(errorCall.error[0]).toHaveProperty('path')
            expect(errorCall.error[0]).toHaveProperty('message')
            expect(errorCall.error[0]).toHaveProperty('code')
        })
    })
})
