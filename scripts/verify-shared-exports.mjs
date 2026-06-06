import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Verifies that every `@lucky/shared/<subpath>` specifier imported by a consumer
// package resolves against the BUILT shared package + its `exports` map — i.e. the
// thing that crashes the prod ESM Docker image but passes ts-jest/tsc (which resolve
// from source). Run AFTER `build:shared`. See incident: a `@lucky/shared/utils/support`
// directory-barrel import only matched the `./utils/*` wildcard (flat file) →
// ERR_MODULE_NOT_FOUND in prod → backend crash → auto-rollback (#1248/#1249).

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

// Consumer packages whose PROD source imports @lucky/shared at runtime.
const consumerSrcDirs = [
    'packages/backend/src',
    'packages/bot/src',
    'packages/frontend/src',
].map((p) => path.join(repoRoot, p))

// Only these codes mean "the build/exports map cannot resolve this specifier" — the
// deploy-break class. A module that RESOLVES but throws at load (missing env, side
// effects) is out of scope here and must not fail this gate.
const RESOLUTION_ERROR_CODES = new Set([
    'ERR_MODULE_NOT_FOUND',
    'ERR_PACKAGE_PATH_NOT_EXPORTED',
    'ERR_UNSUPPORTED_DIR_IMPORT',
    'ERR_PACKAGE_IMPORT_NOT_DEFINED',
])

const isTestFile = (name) => /\.(spec|test)\.(ts|tsx)$/.test(name)

async function collectSourceFiles(dir) {
    let entries
    try {
        entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
        // The three consumer roots are this gate's contract. A missing/renamed
        // src tree must fail loudly — silently returning [] would pass green with
        // reduced coverage, exactly the blind spot this check exists to close.
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(
            `Unable to scan consumer source dir "${path.relative(repoRoot, dir)}": ${message}`,
        )
    }
    const nested = await Promise.all(
        entries.map(async (entry) => {
            const entryPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                if (entry.name === '__tests__' || entry.name === 'node_modules')
                    return []
                return collectSourceFiles(entryPath)
            }
            return entry.isFile() &&
                /\.(ts|tsx)$/.test(entry.name) &&
                !isTestFile(entry.name)
                ? [entryPath]
                : []
        }),
    )
    return nested.flat()
}

// `import …/export … from '@lucky/shared…'` — group 1 captures a leading `type ` so
// type-only statements (erased at build, never resolved at runtime) are skipped.
const FROM_RE =
    /(?:import|export)\s+(type\s+)?[^;'"]*?from\s+['"](@lucky\/shared[^'"]*)['"]/g
// Bare side-effect import: `import '@lucky/shared/x'`.
const BARE_RE = /(?:^|\n)\s*import\s+['"](@lucky\/shared[^'"]*)['"]/g

async function collectSpecifiers() {
    const specifiers = new Set()
    for (const dir of consumerSrcDirs) {
        for (const filePath of await collectSourceFiles(dir)) {
            const content = await readFile(filePath, 'utf8')
            for (const m of content.matchAll(FROM_RE)) {
                if (m[1]) continue // `import type …` — erased, no runtime resolution
                specifiers.add(m[2])
            }
            for (const m of content.matchAll(BARE_RE)) specifiers.add(m[1])
        }
    }
    return [...specifiers].sort()
}

const failures = []
let specifiers = []
try {
    specifiers = await collectSpecifiers()
    for (const specifier of specifiers) {
        try {
            await import(specifier)
        } catch (error) {
            const code =
                error && typeof error === 'object' && 'code' in error
                    ? String(error.code)
                    : 'UNKNOWN'
            if (RESOLUTION_ERROR_CODES.has(code)) {
                const message =
                    error instanceof Error ? error.message : String(error)
                failures.push(`${specifier} -> ${code}: ${message}`)
            }
        }
    }
} catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failures.push(`scan -> UNKNOWN: ${message}`)
}

if (failures.length > 0) {
    console.error('Shared export verification failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    console.error(
        '\nFix: add an explicit `exports` entry in packages/shared/package.json for the\n' +
            'subpath. Directory barrels need their own entry — the `./utils/*` / `./services/*`\n' +
            'style wildcards map only FLAT files, not directories. Or import via an\n' +
            'already-exported barrel (e.g. `@lucky/shared/utils`).',
    )
    process.exit(1)
}

console.log(
    `Shared export verification passed (${specifiers.length} @lucky/shared specifiers across backend, bot, frontend).`,
)
