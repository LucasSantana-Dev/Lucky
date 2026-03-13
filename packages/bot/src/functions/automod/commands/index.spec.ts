import { describe, expect, it } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'

describe('automod command loader source', () => {
    it('uses automod category with centralized loader defaults', () => {
        const sourcePath = path.join(__dirname, 'index.ts')
        const source = fs.readFileSync(sourcePath, 'utf8')

        expect(source).not.toContain('excludePatterns')
        expect(source).toContain("category: 'automod'")
        expect(source).toContain("import path from 'node:path'")
        expect(source).toContain("import { fileURLToPath } from 'node:url'")
    })
})
