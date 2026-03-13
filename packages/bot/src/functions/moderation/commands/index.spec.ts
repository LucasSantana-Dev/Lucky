import { describe, expect, it } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'

describe('moderation command loader source', () => {
    it('uses moderation category with centralized loader defaults', () => {
        const sourcePath = path.join(__dirname, 'index.ts')
        const source = fs.readFileSync(sourcePath, 'utf8')

        expect(source).not.toContain('excludePatterns')
        expect(source).toContain("category: 'moderation'")
        expect(source).toContain("import path from 'node:path'")
        expect(source).toContain("import { fileURLToPath } from 'node:url'")
    })
})
