import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { EmbedBuilder } from 'discord.js'
import {
    buildCommandErrorEmbed,
    type BuildCommandErrorEmbedContext,
} from './errorReportEmbed'

const mockMintCorrelationId = jest.fn()
const mockTagCorrelationIdToSentry = jest.fn()
const mockBuildErrorSupportContext = jest.fn()
const mockErrorLog = jest.fn()
const mockCreateUserFriendlyError = jest.fn()
const mockErrorEmbed = jest.fn()

jest.mock('@lucky/shared/utils/support', () => ({
    mintCorrelationId: (...args: unknown[]) => mockMintCorrelationId(...args),
    tagCorrelationIdToSentry: (...args: unknown[]) =>
        mockTagCorrelationIdToSentry(...args),
    buildErrorSupportContext: (...args: unknown[]) =>
        mockBuildErrorSupportContext(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => mockErrorLog(...args),
}))

jest.mock('@lucky/shared/utils/general/errorSanitizer', () => ({
    createUserFriendlyError: (...args: unknown[]) =>
        mockCreateUserFriendlyError(...args),
}))

jest.mock('./embeds', () => ({
    errorEmbed: (...args: unknown[]) => mockErrorEmbed(...args),
}))

const createMockEmbed = (): EmbedBuilder => {
    return {
        setFooter: jest.fn().mockReturnThis(),
        toJSON: jest.fn(() => ({
            title: 'Error',
            description: 'Test error',
            footer: { text: 'Error ID: ABC123' },
        })),
    } as unknown as EmbedBuilder
}

describe('buildCommandErrorEmbed', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockMintCorrelationId.mockReturnValue('ABC12345')
        mockErrorEmbed.mockReturnValue(createMockEmbed())
        mockCreateUserFriendlyError.mockReturnValue('Something went wrong')
        // Set default mock return for buildErrorSupportContext
        mockBuildErrorSupportContext.mockReturnValue({
            supportLink: null,
            footerText:
                'An error occurred. Please try again or contact support.',
        })
    })

    describe('with SUPPORT_URL set', () => {
        beforeEach(() => {
            process.env.SUPPORT_URL = 'https://example.com/support'
            mockBuildErrorSupportContext.mockReturnValue({
                supportLink:
                    'https://example.com/support?cid=ABC12345&command=test',
                footerText: 'Error ID: ABC12345 — [Report this error](...)',
            })
        })

        it('includes report link in embed description when supportLink is provided', () => {
            const error = new Error('Test error')
            const result = buildCommandErrorEmbed(error)

            expect(result.embed).toBeDefined()
            expect(result.correlationId).toBe('ABC12345')

            const callArgs = mockErrorEmbed.mock.calls[0]
            const description = callArgs[1]
            expect(description).toContain('Something went wrong')
            expect(description).toContain('[🛟 Report this error]')
            expect(description).toContain(
                'https://example.com/support?cid=ABC12345&command=test',
            )
        })

        it('sets footer with Error ID only (plain text)', () => {
            const error = new Error('Test error')
            const embed = createMockEmbed()
            mockErrorEmbed.mockReturnValue(embed)

            buildCommandErrorEmbed(error)

            expect(embed.setFooter).toHaveBeenCalledWith({
                text: 'Error ID: ABC12345',
            })
        })

        it('passes context to buildErrorSupportContext', () => {
            const error = new Error('Test error')
            const context: BuildCommandErrorEmbedContext = {
                guildId: 'guild-123',
                command: 'test',
                errorCategory: 'music',
            }

            buildCommandErrorEmbed(error, context)

            expect(mockBuildErrorSupportContext).toHaveBeenCalledWith(
                'ABC12345',
                context,
            )
        })
    })

    describe('with SUPPORT_URL unset', () => {
        beforeEach(() => {
            delete process.env.SUPPORT_URL
            mockBuildErrorSupportContext.mockReturnValue({
                supportLink: null,
                footerText:
                    'An error occurred. Please try again or contact support.',
            })
        })

        it('excludes report link when supportLink is null', () => {
            const error = new Error('Test error')
            const result = buildCommandErrorEmbed(error)

            const callArgs = mockErrorEmbed.mock.calls[0]
            const description = callArgs[1]
            expect(description).toBe('Something went wrong')
            expect(description).not.toContain('[🛟 Report this error]')
        })

        it('still sets footer with Error ID', () => {
            const error = new Error('Test error')
            const embed = createMockEmbed()
            mockErrorEmbed.mockReturnValue(embed)

            buildCommandErrorEmbed(error)

            expect(embed.setFooter).toHaveBeenCalledWith({
                text: 'Error ID: ABC12345',
            })
        })
    })

    describe('correlation id and sentry tagging', () => {
        it('mints a fresh correlation id', () => {
            const error = new Error('Test error')
            const result = buildCommandErrorEmbed(error)

            expect(mockMintCorrelationId).toHaveBeenCalled()
            expect(result.correlationId).toBe('ABC12345')
        })

        it('tags correlation id to sentry', () => {
            const error = new Error('Test error')
            buildCommandErrorEmbed(error)

            expect(mockTagCorrelationIdToSentry).toHaveBeenCalledWith(
                'ABC12345',
            )
        })

        it('logs error with correlation id in data', () => {
            const error = new Error('Test error')
            const context: BuildCommandErrorEmbedContext = {
                guildId: 'guild-123',
                command: 'test',
            }

            buildCommandErrorEmbed(error, context)

            expect(mockErrorLog).toHaveBeenCalledWith({
                message: 'Command error',
                error,
                data: {
                    correlationId: 'ABC12345',
                    guildId: 'guild-123',
                    command: 'test',
                },
            })
        })
    })

    describe('embed building', () => {
        it('calls errorEmbed with title and description', () => {
            const error = new Error('Test error')
            mockBuildErrorSupportContext.mockReturnValue({
                supportLink: 'https://example.com/support?cid=ABC12345',
                footerText: 'Error ID: ABC12345 — [Report](...)',
            })

            buildCommandErrorEmbed(error)

            expect(mockErrorEmbed).toHaveBeenCalledWith(
                'Error',
                expect.stringContaining('Something went wrong'),
            )
        })

        it('returns the embed and correlation id', () => {
            const error = new Error('Test error')
            const mockEmbed = createMockEmbed()
            mockErrorEmbed.mockReturnValue(mockEmbed)

            const result = buildCommandErrorEmbed(error)

            expect(result.embed).toBe(mockEmbed)
            expect(result.correlationId).toBe('ABC12345')
        })

        it('handles unknown error type', () => {
            mockCreateUserFriendlyError.mockReturnValue(
                'An unknown error occurred',
            )
            mockBuildErrorSupportContext.mockReturnValue({
                supportLink: null,
                footerText: 'Error ID: ABC12345',
            })

            const result = buildCommandErrorEmbed('string error')

            expect(result.correlationId).toBe('ABC12345')
            expect(mockCreateUserFriendlyError).toHaveBeenCalledWith(
                'string error',
            )
        })
    })

    describe('context handling', () => {
        beforeEach(() => {
            process.env.SUPPORT_URL = 'https://example.com/support'
            mockBuildErrorSupportContext.mockReturnValue({
                supportLink: 'https://example.com/support?cid=ABC12345',
                footerText: 'Error ID: ABC12345 — [Report](...)',
            })
        })

        it('handles empty context object', () => {
            const error = new Error('Test error')
            const result = buildCommandErrorEmbed(error, {})

            expect(result.correlationId).toBe('ABC12345')
            expect(mockBuildErrorSupportContext).toHaveBeenCalledWith(
                'ABC12345',
                {},
            )
        })

        it('handles undefined context', () => {
            const error = new Error('Test error')
            const result = buildCommandErrorEmbed(error)

            expect(result.correlationId).toBe('ABC12345')
            expect(mockBuildErrorSupportContext).toHaveBeenCalledWith(
                'ABC12345',
                {},
            )
        })

        it('preserves all context fields', () => {
            const error = new Error('Test error')
            const context: BuildCommandErrorEmbedContext = {
                guildId: 'guild-456',
                command: 'music',
                errorCategory: 'timeout',
            }

            buildCommandErrorEmbed(error, context)

            expect(mockBuildErrorSupportContext).toHaveBeenCalledWith(
                'ABC12345',
                expect.objectContaining(context),
            )
        })
    })
})
