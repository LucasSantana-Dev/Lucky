import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const backendSrcDir = path.join(repoRoot, 'packages/backend/src')
const requiredSubpaths = new Set(['guildAutomation/manifestSchema'])

async function collectTsFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    const files = await Promise.all(
        entries.map(async (entry) => {
            const entryPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                return collectTsFiles(entryPath)
            }
            return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : []
        }),
    )
    return files.flat()
}

async function collectSharedSubpaths() {
    const tsFiles = await collectTsFiles(backendSrcDir)
    for (const filePath of tsFiles) {
        const fileContent = await readFile(filePath, 'utf8')
        for (const match of fileContent.matchAll(/@lucky\/shared\/services\/([^'"]+)/g)) {
            requiredSubpaths.add(match[1])
        }
    }
}

const failures = []

try {
    await collectSharedSubpaths()

    for (const subpath of requiredSubpaths) {
        const specifier = `@lucky/shared/services/${subpath}`
        try {
            await import(specifier)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            const code =
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                typeof error.code === 'string'
                    ? error.code
                    : 'UNKNOWN'
            failures.push(`${specifier} -> ${code}: ${message}`)
        }
    }
} catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failures.push(`scan -> UNKNOWN: ${message}`)
}

if (failures.length > 0) {
    console.error('Shared export verification failed:')
    for (const failure of failures) {
        console.error(`- ${failure}`)
    }
    process.exit(1)
}

console.log(`Shared export verification passed (${requiredSubpaths.size} imports).`)
