import { describe, it, expect } from '@jest/globals'
import { getDirname, getFilename, normalizePath } from './pathUtils'

describe('getDirname', () => {
    it('returns the directory part of a file URL', () => {
        const result = getDirname('file:///home/user/project/src/index.ts')
        expect(result).toBe('/home/user/project/src')
    })

    it('works with nested directories', () => {
        const result = getDirname('file:///a/b/c/d/file.ts')
        expect(result).toBe('/a/b/c/d')
    })
})

describe('getFilename', () => {
    it('converts file URL to absolute path', () => {
        const result = getFilename('file:///home/user/project/src/index.ts')
        expect(result).toBe('/home/user/project/src/index.ts')
    })
})

describe('normalizePath', () => {
    it('returns path unchanged on non-Windows platform', () => {
        expect(normalizePath('/home/user/file.ts')).toBe('/home/user/file.ts')
    })

    it('returns path unchanged when not starting with slash', () => {
        expect(normalizePath('relative/path')).toBe('relative/path')
    })
})
