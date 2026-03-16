import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const TARGET_DIRECTORIES = [
    'src/functions/music/commands',
    'src/handlers/webMusic',
]
const FORBIDDEN_PATTERNS = [/\.player\.nodes\.get\(/, /\.player\.queues\.get\(/]

function readTsFiles(directory: string): string[] {
    const absolute = path.resolve(ROOT, directory)
    const entries = fs.readdirSync(absolute, { withFileTypes: true })
    const files: string[] = []

    for (const entry of entries) {
        const fullPath = path.join(absolute, entry.name)

        if (entry.isDirectory()) {
            files.push(...readTsFiles(path.relative(ROOT, fullPath)))
            continue
        }

        if (!entry.isFile()) continue
        if (!entry.name.endsWith('.ts')) continue
        if (
            entry.name.endsWith('.spec.ts') ||
            entry.name.endsWith('.test.ts')
        ) {
            continue
        }

        files.push(fullPath)
    }

    return files
}

describe('queue resolver guardrails', () => {
    it('avoids direct queue lookups in command and web handler folders', () => {
        const violations: string[] = []

        for (const directory of TARGET_DIRECTORIES) {
            for (const filePath of readTsFiles(directory)) {
                const content = fs.readFileSync(filePath, 'utf-8')
                const hasViolation = FORBIDDEN_PATTERNS.some((pattern) =>
                    pattern.test(content),
                )
                if (hasViolation) {
                    violations.push(path.relative(ROOT, filePath))
                }
            }
        }

        expect(violations).toEqual([
            'src/functions/music/commands/play/index.ts',
        ])
    })
})
