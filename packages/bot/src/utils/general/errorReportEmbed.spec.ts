import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { EmbedBuilder } from 'discord.js'
import {
    buildCommandErrorEmbed,
    type BuildCommandErrorEmbedContext,
} from './errorReportEmbed'

const mockBuildErrorSupportContext = jest.fn()
const mockCreateUserFriendlyError = jest.fn()
const mockErrorEmbed = jest.fn()

jest.mock('@lucky/shared/utils/support', () => ({
    buildErrorSupportContext: (...args: unknown[]) =>
        mockBuildErrorSupportContext(...args),
}))

jest.mock('@lucky/shared/utils/general/errorSanitizer', () => ({
    createUserFriendlyError: (...args: unknown[]) =>
        mockCreateUserFriendlyError(...args),
}))

jest.mock('./embeds', () => ({
    errorEmbed: (...args: unknown[]) => mockErrorEmbed(...args),
}))

const CID = 'ABC12345'

const createMockEmbed = (): EmbedBuilder => {
    return {
        setFooter: jest.fn().mockReturnThis(),
        toJSON: jest.fn(() => ({
            title: 'Error',
            description: 'Test error',
            footer: { text: `Error ID: ${CID}` },
        })),
    } as unknown as EmbedBuilder
}

describe('buildCommandErrorEmbed', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockErrorEmbed.mockReturnValue(createMockEmbed())
        mockCreateUserFriendlyError.mockReturnValue('Something went wrong')
        mockBuildErrorSupportContext.mockReturnValue({
            supportLink: null,
            footerText:
                'An error occurred. Please try again or contact support.',
        })
    })

    describe('with SUPPORT_URL set (supportLink provided)', () => {
        beforeEach(() => {
            mockBuildErrorSupportContext.mockReturnValue({
                supportLink:
                    'https://example.com/support?cid=ABC12345&command=test',
                footerText: 'Error ID: ABC12345 — [Report this error](...)',
            })
        })

        it('includes the report link in the embed description', () => {
            buildCommandErrorEmbed(new Error('Test error'), CID)

            const description = mockErrorEmbed.mock.calls[0][1]
            expect(description).toContain('Something went wrong')
            expect(description).toContain('[🛟 Report this error]')
            expect(description).toContain(
                'https://example.com/support?cid=ABC12345&command=test',
            )
        })

        it('sets the footer to the plain-text Error ID only', () => {
            const embed = createMockEmbed()
            mockErrorEmbed.mockReturnValue(embed)

            buildCommandErrorEmbed(new Error('Test error'), CID)

            expect(embed.setFooter).toHaveBeenCalledWith({
                text: `Error ID: ${CID}`,
            })
        })

        it('passes the correlation id and context to buildErrorSupportContext', () => {
            const context: BuildCommandErrorEmbedContext = {
                guildId: 'guild-123',
                command: 'test',
                errorCategory: 'music',
            }

            buildCommandErrorEmbed(new Error('Test error'), CID, context)

            expect(mockBuildErrorSupportContext).toHaveBeenCalledWith(
                CID,
                context,
            )
        })
    })

    describe('with SUPPORT_URL unset (supportLink null)', () => {
        it('excludes the report link from the description', () => {
            buildCommandErrorEmbed(new Error('Test error'), CID)

            const description = mockErrorEmbed.mock.calls[0][1]
            expect(description).toBe('Something went wrong')
            expect(description).not.toContain('[🛟 Report this error]')
        })

        it('still sets the footer with the Error ID', () => {
            const embed = createMockEmbed()
            mockErrorEmbed.mockReturnValue(embed)

            buildCommandErrorEmbed(new Error('Test error'), CID)

            expect(embed.setFooter).toHaveBeenCalledWith({
                text: `Error ID: ${CID}`,
            })
        })
    })

    describe('embed building', () => {
        it('calls errorEmbed with the title and description', () => {
            buildCommandErrorEmbed(new Error('Test error'), CID)

            expect(mockErrorEmbed).toHaveBeenCalledWith(
                'Error',
                expect.stringContaining('Something went wrong'),
            )
        })

        it('returns the built embed', () => {
            const embed = createMockEmbed()
            mockErrorEmbed.mockReturnValue(embed)

            const result = buildCommandErrorEmbed(new Error('Test error'), CID)

            expect(result).toBe(embed)
        })

        it('sanitizes unknown (non-Error) error types', () => {
            mockCreateUserFriendlyError.mockReturnValue(
                'An unknown error occurred',
            )

            buildCommandErrorEmbed('string error', CID)

            expect(mockCreateUserFriendlyError).toHaveBeenCalledWith(
                'string error',
            )
        })
    })

    describe('context handling', () => {
        it('defaults to an empty context object when omitted', () => {
            buildCommandErrorEmbed(new Error('Test error'), CID)

            expect(mockBuildErrorSupportContext).toHaveBeenCalledWith(CID, {})
        })

        it('preserves all context fields', () => {
            const context: BuildCommandErrorEmbedContext = {
                guildId: 'guild-456',
                command: 'music',
                errorCategory: 'timeout',
            }

            buildCommandErrorEmbed(new Error('Test error'), CID, context)

            expect(mockBuildErrorSupportContext).toHaveBeenCalledWith(
                CID,
                expect.objectContaining(context),
            )
        })
    })
})
