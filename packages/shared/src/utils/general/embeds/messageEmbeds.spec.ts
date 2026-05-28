import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import {
    createSuccessEmbed,
    createWarningEmbed,
    createInfoEmbed,
    createLoadingEmbed,
} from './messageEmbeds'
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

describe('messageEmbeds', () => {
    let mockEmbed: {
        setTitle: ReturnType<typeof jest.fn>
        setDescription: ReturnType<typeof jest.fn>
        setColor: ReturnType<typeof jest.fn>
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

    describe('createSuccessEmbed', () => {
        it('creates with title and description', () => {
            createSuccessEmbed('Done', 'Operation completed')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith(
                `${EMOJIS.SUCCESS} Done`,
            )
            expect(mockEmbed.setDescription).toHaveBeenCalledWith(
                'Operation completed',
            )
            expect(mockEmbed.setColor).toHaveBeenCalledWith(
                EMBED_COLORS.SUCCESS,
            )
            expect(mockEmbed.setTimestamp).toHaveBeenCalled()
        })

        it('sets footer when provided', () => {
            createSuccessEmbed('Done', 'Desc', 'Footer text')
            expect(mockEmbed.setFooter).toHaveBeenCalledWith({
                text: 'Footer text',
            })
        })

        it('does not set footer when not provided', () => {
            createSuccessEmbed('Done', 'Desc')
            expect(mockEmbed.setFooter).not.toHaveBeenCalled()
        })
    })

    describe('createWarningEmbed', () => {
        it('creates with title and description', () => {
            createWarningEmbed('Warning', 'Be careful')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith(
                `${EMOJIS.WARNING} Warning`,
            )
            expect(mockEmbed.setDescription).toHaveBeenCalledWith('Be careful')
            expect(mockEmbed.setColor).toHaveBeenCalledWith(
                EMBED_COLORS.WARNING,
            )
            expect(mockEmbed.setTimestamp).toHaveBeenCalled()
        })

        it('sets footer when provided', () => {
            createWarningEmbed('Warning', 'Desc', 'Footer')
            expect(mockEmbed.setFooter).toHaveBeenCalledWith({ text: 'Footer' })
        })
    })

    describe('createInfoEmbed', () => {
        it('creates with title and description', () => {
            createInfoEmbed('Info', 'Some info')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith(
                `${EMOJIS.INFO} Info`,
            )
            expect(mockEmbed.setDescription).toHaveBeenCalledWith('Some info')
            expect(mockEmbed.setColor).toHaveBeenCalledWith(EMBED_COLORS.INFO)
            expect(mockEmbed.setTimestamp).toHaveBeenCalled()
        })

        it('sets footer when provided', () => {
            createInfoEmbed('Info', 'Desc', 'Footer')
            expect(mockEmbed.setFooter).toHaveBeenCalledWith({ text: 'Footer' })
        })
    })

    describe('createLoadingEmbed', () => {
        it('creates with loading title and custom message', () => {
            createLoadingEmbed('Please wait...')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith('⏳ Loading...')
            expect(mockEmbed.setDescription).toHaveBeenCalledWith(
                'Please wait...',
            )
            expect(mockEmbed.setColor).toHaveBeenCalledWith(EMBED_COLORS.INFO)
        })

        it('does not set timestamp', () => {
            createLoadingEmbed('Loading')
            expect(mockEmbed.setTimestamp).not.toHaveBeenCalled()
        })
    })
})
