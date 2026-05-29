import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { createErrorEmbed, createUserErrorEmbed } from './errorEmbeds'
import { EMBED_COLORS, EMOJIS } from './constants'

jest.mock('discord', () => ({
    EmbedBuilder: jest.fn().mockImplementation(() => ({
        setTitle: jest.fn().mockReturnThis(),
        setDescription: jest.fn().mockReturnThis(),
        setColor: jest.fn().mockReturnThis(),
        setThumbnail: jest.fn().mockReturnThis(),
        setURL: jest.fn().mockReturnThis(),
        setAuthor: jest.fn().mockReturnThis(),
        addFields: jest.fn().mockReturnThis(),
        setFooter: jest.fn().mockReturnThis(),
        setTimestamp: jest.fn().mockReturnThis(),
        data: {},
    })),
}))

jest.mock('../../error/errorHandler', () => ({
    handleError: jest.fn(),
    createUserErrorMessage: jest
        .fn<() => string>()
        .mockReturnValue('Something went wrong'),
}))

describe('errorEmbeds', () => {
    let mockEmbed: {
        setTitle: ReturnType<typeof jest.fn>
        setDescription: ReturnType<typeof jest.fn>
        setColor: ReturnType<typeof jest.fn>
        addFields: ReturnType<typeof jest.fn>
        setFooter: ReturnType<typeof jest.fn>
        setTimestamp: ReturnType<typeof jest.fn>
        data: object
    }

    beforeEach(() => {
        mockEmbed = {
            setTitle: jest.fn().mockReturnThis() as ReturnType<typeof jest.fn>,
            setDescription: jest.fn().mockReturnThis() as ReturnType<
                typeof jest.fn
            >,
            setColor: jest.fn().mockReturnThis() as ReturnType<typeof jest.fn>,
            addFields: jest.fn().mockReturnThis() as ReturnType<typeof jest.fn>,
            setFooter: jest.fn().mockReturnThis() as ReturnType<typeof jest.fn>,
            setTimestamp: jest.fn().mockReturnThis() as ReturnType<
                typeof jest.fn
            >,
            data: {},
        }
        const { EmbedBuilder } = require('discord') as {
            EmbedBuilder: jest.Mock
        }
        EmbedBuilder.mockImplementation(() => mockEmbed)
    })

    describe('createErrorEmbed', () => {
        it('creates basic error embed without error object', () => {
            createErrorEmbed('Error Title', 'Something failed')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith(
                `${EMOJIS.ERROR} Error Title`,
            )
            expect(mockEmbed.setDescription).toHaveBeenCalledWith(
                'Something failed',
            )
            expect(mockEmbed.setColor).toHaveBeenCalledWith(EMBED_COLORS.ERROR)
            expect(mockEmbed.setTimestamp).toHaveBeenCalled()
        })

        it('sets footer when provided', () => {
            createErrorEmbed('Title', 'Desc', undefined, 'Footer text')

            expect(mockEmbed.setFooter).toHaveBeenCalledWith({
                text: 'Footer text',
            })
        })

        it('adds error details field when error object provided', () => {
            const error = new Error('DB connection failed')
            createErrorEmbed('DB Error', 'Connection failed', error)

            expect(mockEmbed.addFields).toHaveBeenCalledWith({
                name: 'Error Details',
                value: '```DB connection failed```',
                inline: false,
            })
        })

        it('calls handleError when error object provided', () => {
            const { handleError } = require('../../error/errorHandler') as {
                handleError: jest.Mock
            }
            const error = new Error('Some error')
            createErrorEmbed('Title', 'Desc', error)

            expect(handleError).toHaveBeenCalledWith(
                error,
                expect.objectContaining({
                    details: expect.objectContaining({
                        context: 'Error Embed Creation',
                    }),
                }),
            )
        })

        it('does not add error fields when no error provided', () => {
            createErrorEmbed('Title', 'Desc')

            expect(mockEmbed.addFields).not.toHaveBeenCalled()
        })
    })

    describe('createUserErrorEmbed', () => {
        it('uses createUserErrorMessage result as description', () => {
            const { createUserErrorMessage } =
                require('../../error/errorHandler') as {
                    createUserErrorMessage: jest.Mock
                }
            ;(createUserErrorMessage as jest.Mock).mockReturnValue(
                'User-friendly message',
            )

            createUserErrorEmbed('Error', 'fallback description')

            expect(mockEmbed.setDescription).toHaveBeenCalledWith(
                'User-friendly message',
            )
        })

        it('falls back to description when createUserErrorMessage returns empty', () => {
            const { createUserErrorMessage } =
                require('../../error/errorHandler') as {
                    createUserErrorMessage: jest.Mock
                }
            ;(createUserErrorMessage as jest.Mock).mockReturnValue('')

            createUserErrorEmbed('Error', 'fallback description')

            expect(mockEmbed.setDescription).toHaveBeenCalledWith(
                'fallback description',
            )
        })

        it('sets error color', () => {
            createUserErrorEmbed('Title', 'Desc')
            expect(mockEmbed.setColor).toHaveBeenCalledWith(EMBED_COLORS.ERROR)
        })

        it('sets footer when provided', () => {
            createUserErrorEmbed('Title', 'Desc', undefined, 'Footer text')
            expect(mockEmbed.setFooter).toHaveBeenCalledWith({
                text: 'Footer text',
            })
        })
    })
})
