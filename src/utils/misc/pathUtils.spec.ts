import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { getDirname, getFilename, normalizePath } from './pathUtils'

// Mock the url module
jest.mock('url', () => ({
    fileURLToPath: jest.fn()
}))

// Mock the path module
jest.mock('path', () => ({
    dirname: jest.fn()
}))

describe('Path Utilities', () => {
    let mockFileURLToPath: jest.MockedFunction<typeof import('url').fileURLToPath>
    let mockDirname: jest.MockedFunction<typeof import('path').dirname>

    beforeEach(() => {
        jest.clearAllMocks()
        mockFileURLToPath = require('url').fileURLToPath
        mockDirname = require('path').dirname
    })

    describe('getDirname', () => {
        it('should return the directory name of a file URL', () => {
            const mockUrl = 'file:///path/to/file.js'
            const mockPath = '/path/to/file.js'
            const mockDir = '/path/to'

            mockFileURLToPath.mockReturnValue(mockPath)
            mockDirname.mockReturnValue(mockDir)

            const result = getDirname(mockUrl)

            expect(mockFileURLToPath).toHaveBeenCalledWith(mockUrl)
            expect(mockDirname).toHaveBeenCalledWith(mockPath)
            expect(result).toBe(mockDir)
        })

        it('should handle different URL formats', () => {
            const mockUrl = 'file:///C:/Users/Test/file.js'
            const mockPath = 'C:/Users/Test/file.js'
            const mockDir = 'C:/Users/Test'

            mockFileURLToPath.mockReturnValue(mockPath)
            mockDirname.mockReturnValue(mockDir)

            const result = getDirname(mockUrl)

            expect(result).toBe(mockDir)
        })
    })

    describe('getFilename', () => {
        it('should return the filename from a file URL', () => {
            const mockUrl = 'file:///path/to/file.js'
            const mockPath = '/path/to/file.js'

            mockFileURLToPath.mockReturnValue(mockPath)

            const result = getFilename(mockUrl)

            expect(mockFileURLToPath).toHaveBeenCalledWith(mockUrl)
            expect(result).toBe(mockPath)
        })

        it('should handle different URL formats', () => {
            const mockUrl = 'file:///C:/Users/Test/file.js'
            const mockPath = 'C:/Users/Test/file.js'

            mockFileURLToPath.mockReturnValue(mockPath)

            const result = getFilename(mockUrl)

            expect(result).toBe(mockPath)
        })
    })

    describe('normalizePath', () => {
        it('should return path unchanged on non-Windows platforms', () => {
            const originalPlatform = process.platform
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                configurable: true
            })

            const path = '/some/path'
            const result = normalizePath(path)

            expect(result).toBe(path)

            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
                configurable: true
            })
        })

        it('should return path unchanged on Windows when path does not start with slash', () => {
            const originalPlatform = process.platform
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                configurable: true
            })

            const path = 'C:\\some\\path'
            const result = normalizePath(path)

            expect(result).toBe(path)

            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
                configurable: true
            })
        })

        it('should remove leading slash on Windows when path starts with slash', () => {
            const originalPlatform = process.platform
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                configurable: true
            })

            const path = '/some/path'
            const result = normalizePath(path)

            expect(result).toBe('some/path')

            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
                configurable: true
            })
        })

        it('should handle empty string', () => {
            const result = normalizePath('')
            expect(result).toBe('')
        })

        it('should handle single slash on Windows', () => {
            const originalPlatform = process.platform
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                configurable: true
            })

            const result = normalizePath('/')

            expect(result).toBe('')

            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
                configurable: true
            })
        })
    })
})
