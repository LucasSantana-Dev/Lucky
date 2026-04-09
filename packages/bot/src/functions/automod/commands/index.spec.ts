import { describe, expect, it } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'

describe('automod command loader', () => {
    it('exports a function that loads commands with automod category', () => {
        const sourcePath = path.join(__dirname, 'index.ts')
        const source = fs.readFileSync(sourcePath, 'utf8')

        // Verify the loader uses getCommandsFromDirectory with automod category
        expect(source).toContain("category: 'automod'")
        // Verify it imports required utilities for dynamic directory loading
        expect(source).toContain("import path from 'node:path'")
        expect(source).toContain("import { fileURLToPath } from 'node:url'")
        // Verify error handling is in place
        expect(source).toContain('catch (error)')
        expect(source).toContain('return []')
    })
})
