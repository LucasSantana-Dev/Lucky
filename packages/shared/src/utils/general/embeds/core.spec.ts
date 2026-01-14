import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { createEmbed, formatTime, createProgressBar } from './core'
import { EMBED_COLORS } from './constants'

// Mock Discord.js EmbedBuilder
jest.mock('discord.js', () => ({
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

describe('Embed Utilities', () => {
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
        const { EmbedBuilder } = require('discord.js')
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

        it('should create an embed with author', () => {
            createEmbed({
                title: 'Test Title',
                author: {
                    name: 'Test Author',
                    iconURL: 'https://example.com/icon.png',
                },
            })

            expect(mockEmbed.setAuthor).toHaveBeenCalledWith({
                name: 'Test Author',
                iconURL: 'https://example.com/icon.png',
                url: undefined,
            })
        })

        it('should create an embed with fields', () => {
            createEmbed({
                title: 'Test Title',
                fields: [
                    { name: 'Field 1', value: 'Value 1' },
                    { name: 'Field 2', value: 'Value 2', inline: true },
                ],
            })

            expect(mockEmbed.addFields).toHaveBeenCalledWith([
                { name: 'Field 1', value: 'Value 1' },
                { name: 'Field 2', value: 'Value 2', inline: true },
            ])
        })

        it('should create an embed with footer', () => {
            createEmbed({
                title: 'Test Title',
                footer: 'Test Footer',
            })

            expect(mockEmbed.setFooter).toHaveBeenCalledWith({ text: 'Test Footer' })
        })

        it('should create an embed with timestamp', () => {
            createEmbed({
                title: 'Test Title',
                timestamp: true,
            })

            expect(mockEmbed.setTimestamp).toHaveBeenCalled()
        })

        it('should create an embed with thumbnail', () => {
            createEmbed({
                title: 'Test Title',
                thumbnail: 'https://example.com/thumb.png',
            })

            expect(mockEmbed.setThumbnail).toHaveBeenCalledWith('https://example.com/thumb.png')
        })

        it('should create an embed with URL', () => {
            createEmbed({
                title: 'Test Title',
                url: 'https://example.com',
            })

            expect(mockEmbed.setURL).toHaveBeenCalledWith('https://example.com')
        })
    })

    describe('formatTime', () => {
        it('should format seconds correctly', () => {
            expect(formatTime(0)).toBe('0:00')
            expect(formatTime(30)).toBe('0:30')
            expect(formatTime(60)).toBe('1:00')
            expect(formatTime(90)).toBe('1:30')
            expect(formatTime(3661)).toBe('1:01:01')
        })

        it('should handle edge cases', () => {
            expect(formatTime(59)).toBe('0:59')
            expect(formatTime(3600)).toBe('1:00:00')
            expect(formatTime(3601)).toBe('1:00:01')
        })
    })

    describe('createProgressBar', () => {
        it('should create a progress bar', () => {
            const bar = createProgressBar(5, 10, 10)
            expect(bar).toContain('50%')
            expect(bar).toContain('[')
            expect(bar).toContain(']')
        })

        it('should handle 0% progress', () => {
            const bar = createProgressBar(0, 10, 10)
            expect(bar).toContain('0%')
        })

        it('should handle 100% progress', () => {
            const bar = createProgressBar(10, 10, 10)
            expect(bar).toContain('100%')
        })

        it('should handle over 100% progress', () => {
            const bar = createProgressBar(15, 10, 10)
            expect(bar).toContain('100%')
        })

        it('should use default length of 20', () => {
            const bar = createProgressBar(5, 10)
            expect(bar).toContain('50%')
        })
    })
})
