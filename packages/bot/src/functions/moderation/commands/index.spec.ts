import { describe, expect, it } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'

describe('moderation command loader', () => {
    it('exports a function that loads commands with moderation category', () => {
        const sourcePath = path.join(__dirname, 'index.ts')
        const source = fs.readFileSync(sourcePath, 'utf8')

        // Verify the loader uses getCommandsFromDirectory with moderation category
        expect(source).toContain("category: 'moderation'")
        // Verify it imports required utilities for dynamic directory loading
        expect(source).toContain("import path from 'node:path'")
        expect(source).toContain("import { fileURLToPath } from 'node:url'")
        // Verify error handling is in place
        expect(source).toContain('catch (error)')
        expect(source).toContain('return []')
    })

    it('does not contain non-command helper modules directly in commands/ (regression for #2501)', () => {
        // getCommandsFromDirectory treats every non-index, non-spec .ts file in
        // this directory as a command module and logs an error if it has no
        // default/`command` export. Shared helpers used by multiple commands
        // must live outside commands/ (e.g. ../helpers) so boot doesn't log a
        // false "not a valid Command instance" error for them.
        const entries = fs
            .readdirSync(__dirname, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .filter(
                (file) =>
                    file.endsWith('.ts') &&
                    !file.endsWith('.d.ts') &&
                    !file.includes('.spec.') &&
                    !file.includes('.test.') &&
                    !file.startsWith('index.'),
            )

        for (const file of entries) {
            const source = fs.readFileSync(path.join(__dirname, file), 'utf8')
            const hasCommandExport =
                /export\s+default\b/.test(source) ||
                /\bexport\s+const\s+command\b/.test(source)
            expect({ file, hasCommandExport }).toEqual({
                file,
                hasCommandExport: true,
            })
        }
    })
})
