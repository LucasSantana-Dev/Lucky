import { describe, expect, it } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'

describe('management command loader', () => {
    it('does not override shared excludePatterns defaults', () => {
        const sourcePath = path.join(__dirname, 'index.ts')
        const source = fs.readFileSync(sourcePath, 'utf8')

        expect(source).not.toContain('excludePatterns')
    })
})
