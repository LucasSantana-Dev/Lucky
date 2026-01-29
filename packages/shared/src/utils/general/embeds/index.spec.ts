import { describe, it, expect } from '@jest/globals'
import {
    createEmbed,
    formatTime,
    createProgressBar,
    successEmbed,
    errorEmbed,
    infoEmbed,
    warningEmbed,
    musicEmbed,
    queueEmbed,
    autoplayEmbed
} from './index'
import { EMBED_COLORS } from './constants'

// Mock Discord.js EmbedBuilder
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
        data: {}
    }))
}))

describe('Embed Index', () => {
    let mockEmbed: any

    beforeEach(() => {
        mockEmbed = {
            setTitle: jest.fn().mockReturnThis(),
            setDescription: jest.fn().mockReturnThis(),
            setColor: jest.fn().mockReturnThis(),
            setThumbnail: jest.fn().mockReturnThis(),
            setURL: jest.fn().mockReturnThis(),
            setAuthor: jest.fn().mockReturnThis(),
            addFields: jest.fn().mockReturnThis(),
            setFooter: jest.fn().mockReturnThis(),
            setTimestamp: jest.fn().mockReturnThis(),
            data: {}
        }
        const { EmbedBuilder } = require('discord')
        EmbedBuilder.mockImplementation(() => mockEmbed)
    })

    describe('createEmbed', () => {
        it('should create a basic embed', () => {
            createEmbed({
                title: 'Test Title',
                description: 'Test Description',
            })

            expect(mockEmbed.setTitle).toHaveBeenCalledWith('Test Title')
            expect(mockEmbed.setDescription).toHaveBeenCalledWith('Test Description')
            expect(mockEmbed.setColor).toHaveBeenCalledWith(EMBED_COLORS.NEUTRAL)
        })

        it('should create an embed with emoji', () => {
            createEmbed({
                title: 'Test Title',
                emoji: '🎵',
            })

            expect(mockEmbed.setTitle).toHaveBeenCalledWith('🎵 Test Title')
        })

        it('should create an embed with color', () => {
            createEmbed({
                title: 'Test Title',
                color: EMBED_COLORS.SUCCESS,
            })

            expect(mockEmbed.setColor).toHaveBeenCalledWith(EMBED_COLORS.SUCCESS)
        })
    })

    describe('formatTime', () => {
        it('should format seconds correctly', () => {
            expect(formatTime(0)).toBe('0:00')
            expect(formatTime(30)).toBe('0:30')
            expect(formatTime(60)).toBe('1:00')
            expect(formatTime(3600)).toBe('1:00:00')
            expect(formatTime(3665)).toBe('1:01:05')
        })

        it('should handle edge cases', () => {
            expect(formatTime(59)).toBe('0:59')
            expect(formatTime(3599)).toBe('59:59')
        })
    })

    describe('createProgressBar', () => {
        it('should create a progress bar', () => {
            expect(createProgressBar(5, 10, 10)).toBe('[█████░░░░░] 50%')
            expect(createProgressBar(7, 10, 10)).toBe('[███████░░░] 70%')
        })

        it('should handle 0% progress', () => {
            expect(createProgressBar(0, 10, 10)).toBe('[░░░░░░░░░░] 0%')
        })

        it('should handle 100% progress', () => {
            expect(createProgressBar(10, 10, 10)).toBe('[██████████] 100%')
        })

        it('should handle over 100% progress', () => {
            expect(createProgressBar(15, 10, 10)).toBe('[██████████] 100%')
        })

        it('should use default length of 20', () => {
            expect(createProgressBar(5, 10)).toBe('[██████████░░░░░░░░░░] 50%')
        })
    })

    describe('successEmbed', () => {
        it('should create a success embed', () => {
            successEmbed('Success Title', 'Success message')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith('✅ Success Title')
            expect(mockEmbed.setDescription).toHaveBeenCalledWith('Success message')
            expect(mockEmbed.setColor).toHaveBeenCalledWith(EMBED_COLORS.SUCCESS)
        })

        it('should create a success embed with default emoji', () => {
            successEmbed('Success Title', 'Success message')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith('✅ Success Title')
        })
    })

    describe('errorEmbed', () => {
        it('should create an error embed', () => {
            errorEmbed('Error Title', 'Error message')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith('❌ Error Title')
            expect(mockEmbed.setDescription).toHaveBeenCalledWith('Error message')
            expect(mockEmbed.setColor).toHaveBeenCalledWith(EMBED_COLORS.ERROR)
        })

        it('should create an error embed with default emoji', () => {
            errorEmbed('Error Title', 'Error message')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith('❌ Error Title')
        })
    })

    describe('infoEmbed', () => {
        it('should create an info embed', () => {
            infoEmbed('Info Title', 'Info message')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith('ℹ️ Info Title')
            expect(mockEmbed.setDescription).toHaveBeenCalledWith('Info message')
            expect(mockEmbed.setColor).toHaveBeenCalledWith(EMBED_COLORS.INFO)
        })

        it('should create an info embed with default emoji', () => {
            infoEmbed('Info Title', 'Info message')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith('ℹ️ Info Title')
        })
    })

    describe('warningEmbed', () => {
        it('should create a warning embed', () => {
            warningEmbed('Warning Title', 'Warning message')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith('⚠️ Warning Title')
            expect(mockEmbed.setDescription).toHaveBeenCalledWith('Warning message')
            expect(mockEmbed.setColor).toHaveBeenCalledWith(EMBED_COLORS.WARNING)
        })

        it('should create a warning embed with default emoji', () => {
            warningEmbed('Warning Title', 'Warning message')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith('⚠️ Warning Title')
        })
    })

    describe('musicEmbed', () => {
        it('should create a music embed', () => {
            musicEmbed('Music Title', 'Music message')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith('🎵 Music Title')
            expect(mockEmbed.setDescription).toHaveBeenCalledWith('Music message')
            expect(mockEmbed.setColor).toHaveBeenCalledWith(EMBED_COLORS.MUSIC)
        })

        it('should create a music embed with default emoji', () => {
            musicEmbed('Music Title', 'Music message')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith('🎵 Music Title')
        })
    })

    describe('queueEmbed', () => {
        it('should create a queue embed', () => {
            queueEmbed('Queue Title', 'Queue message')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith('📋 Queue Title')
            expect(mockEmbed.setDescription).toHaveBeenCalledWith('Queue message')
            expect(mockEmbed.setColor).toHaveBeenCalledWith(EMBED_COLORS.QUEUE)
        })

        it('should create a queue embed with default emoji', () => {
            queueEmbed('Queue Title', 'Queue message')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith('📋 Queue Title')
        })
    })

    describe('autoplayEmbed', () => {
        it('should create an autoplay embed', () => {
            autoplayEmbed('Autoplay Title', 'Autoplay message')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith('🔄 Autoplay Title')
            expect(mockEmbed.setDescription).toHaveBeenCalledWith('Autoplay message')
            expect(mockEmbed.setColor).toHaveBeenCalledWith(EMBED_COLORS.AUTOPLAY)
        })

        it('should create an autoplay embed with default emoji', () => {
            autoplayEmbed('Autoplay Title', 'Autoplay message')

            expect(mockEmbed.setTitle).toHaveBeenCalledWith('🔄 Autoplay Title')
        })
    })

    describe('Integration tests', () => {
        it('should work with all embed types', () => {
            const embeds = [
                successEmbed('Success', 'Message'),
                errorEmbed('Error', 'Message'),
                infoEmbed('Info', 'Message'),
                warningEmbed('Warning', 'Message'),
                musicEmbed('Music', 'Message'),
                queueEmbed('Queue', 'Message'),
                autoplayEmbed('Autoplay', 'Message')
            ]

            expect(embeds).toHaveLength(7)
            embeds.forEach(embed => {
                expect(embed).toBeDefined()
            })
        })

        it('should handle time formatting in embeds', () => {
            const timeString = formatTime(125)
            expect(timeString).toBe('2:05')
        })

        it('should handle progress bars in embeds', () => {
            const progressBar = createProgressBar(3, 10, 10)
            expect(progressBar).toBe('[███░░░░░░░] 30%')
        })
    })
})
