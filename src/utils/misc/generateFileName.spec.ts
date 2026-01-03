import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { generateFileName } from './generateFileName'

// Mock the crypto module
jest.mock('node:crypto', () => ({
    randomUUID: jest.fn()
}))

describe('Generate File Name', () => {
    let mockRandomUUID: jest.MockedFunction<typeof import('node:crypto').randomUUID>

    beforeEach(() => {
        jest.clearAllMocks()
        mockRandomUUID = require('node:crypto').randomUUID
    })

    it('should generate a filename with the provided extension', () => {
        const mockUUID = '123e4567-e89b-12d3-a456-426614174000'
        mockRandomUUID.mockReturnValue(mockUUID)

        const result = generateFileName({ fileExt: 'mp3' })

        expect(mockRandomUUID).toHaveBeenCalled()
        expect(result).toBe(`${mockUUID}.mp3`)
    })

    it('should handle different file extensions', () => {
        const mockUUID = '987fcdeb-51a2-43d7-8f9e-123456789abc'
        mockRandomUUID.mockReturnValue(mockUUID)

        const result = generateFileName({ fileExt: 'wav' })

        expect(result).toBe(`${mockUUID}.wav`)
    })

    it('should handle extensions with dots', () => {
        const mockUUID = 'abcdef12-3456-7890-abcd-ef1234567890'
        mockRandomUUID.mockReturnValue(mockUUID)

        const result = generateFileName({ fileExt: '.mp4' })

        expect(result).toBe(`${mockUUID}..mp4`)
    })

    it('should handle empty extension', () => {
        const mockUUID = '00000000-0000-0000-0000-000000000000'
        mockRandomUUID.mockReturnValue(mockUUID)

        const result = generateFileName({ fileExt: '' })

        expect(result).toBe(`${mockUUID}.`)
    })

    it('should generate unique filenames on multiple calls', () => {
        const mockUUID1 = '11111111-1111-1111-1111-111111111111'
        const mockUUID2 = '22222222-2222-2222-2222-222222222222'

        mockRandomUUID
            .mockReturnValueOnce(mockUUID1)
            .mockReturnValueOnce(mockUUID2)

        const result1 = generateFileName({ fileExt: 'txt' })
        const result2 = generateFileName({ fileExt: 'txt' })

        expect(result1).toBe(`${mockUUID1}.txt`)
        expect(result2).toBe(`${mockUUID2}.txt`)
        expect(mockRandomUUID).toHaveBeenCalledTimes(2)
    })

    it('should handle complex extensions', () => {
        const mockUUID = 'complex-uuid-1234-5678-9abc-def012345678'
        mockRandomUUID.mockReturnValue(mockUUID)

        const result = generateFileName({ fileExt: 'tar.gz' })

        expect(result).toBe(`${mockUUID}.tar.gz`)
    })
})
