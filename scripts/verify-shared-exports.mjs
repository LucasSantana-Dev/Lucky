import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const requiredSubpaths = new Set(['guildAutomation/manifestSchema'])

let scanOutput = ''

try {
    scanOutput = execSync(
        "rg -n --no-heading \"@lucky/shared/services/[^'\\\"]+\" packages/backend/src -g \"*.ts\"",
        {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        },
    )
} catch {
    scanOutput = ''
}

for (const match of scanOutput.matchAll(/@lucky\/shared\/services\/([^'"]+)/g)) {
    requiredSubpaths.add(match[1])
}

const failures = []

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

if (failures.length > 0) {
    console.error('Shared export verification failed:')
    for (const failure of failures) {
        console.error(`- ${failure}`)
    }
    process.exit(1)
}

console.log(`Shared export verification passed (${requiredSubpaths.size} imports).`)
