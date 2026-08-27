import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Every `import x from './y.json'` in a package that Node loads directly must
// carry `with { type: 'json' }`.
//
// This shipped in v2.40.0 and crash-looped the bot at boot:
//
//   TypeError [ERR_IMPORT_ATTRIBUTE_MISSING]: Module
//   "file:///app/packages/bot/dist/locales/en.json" needs an import attribute
//   of "type: json"
//
// The homelab auto-rolled back to 2.39.8 after the bot failed its gateway
// health check. Nothing caught it earlier because nothing in CI ever RUNS the
// built output: jest transpiles to CJS, where a bare JSON import is legal, and
// `npm run build` compiles without executing. tsc emits the import verbatim,
// so the only place the difference shows up is a real Node ESM load.
//
// The frontend is deliberately NOT checked. It is bundled by vite, which
// resolves JSON at build time, so its imports never reach Node's ESM loader and
// requiring the attribute there would be wrong.

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

// Packages whose built output Node loads directly (each is "type": "module").
const NODE_ESM_PACKAGES = ['bot', 'backend', 'shared']

// The `from` clause is optional: `import './seed.json'` is a side-effect
// import and Node rejects it without the attribute just the same. Dynamic
// `import('./x.json', { with: { type: 'json' } })` is a different grammar and
// is NOT covered here.
const JSON_IMPORT_RE = /\bimport\s+(?:[^;'"]*?\bfrom\s*)?(['"])([^'"]*\.json)\1/g

// ESM puts the attribute immediately after the module specifier, so that is
// exactly what is required: optional whitespace or newlines, then
// `with { ... }`, then `type: 'json'` inside those braces.
//
// An earlier version scanned forward to a "statement end" instead, and was
// wrong in both directions. It rejected a valid multiline attribute, because
// the `type:` property looked like the start of a TS `type` alias. And, worse,
// a later line such as `logger.debug("with { type: 'json' }")` could satisfy
// it, letting a genuinely bare import through. A false negative is the
// expensive kind of gate bug: it is the one that ships.
const ATTRIBUTE_WINDOW = 200

// Comments are legal in both token gaps. ECMAScript has no
// `[no LineTerminator here]` between the specifier and `with`, so a line
// comment or a newline there is valid code and must not read as a missing
// attribute. The block-comment branch is the unrolled-loop form on purpose:
// the obvious `\/\*[\s\S]*?\*\/` backtracks exponentially on repeated `*//*`.
// The line-comment branch is anchored to the end of the line on purpose.
// The character class is greedy but it BACKTRACKS, so without the lookahead
// it can give the comment body back and expose a `with` written inside it,
// letting `import a from './x.json' // with { type: 'json' }` read as
// attributed and ship. Only the full run to a line terminator satisfies the
// lookahead, which makes the branch effectively atomic.
const TRIVIA = String.raw`(?:\s|\/\/[^\r\n\u2028\u2029]*(?=[\r\n\u2028\u2029]|$)|\/\*[^*]*\*+(?:[^\/*][^*]*\*+)*\/)*`
const WITH_CLAUSE = new RegExp(String.raw`^${TRIVIA}with${TRIVIA}\{([^}]*)\}`)
const JSON_TYPE = /\btype\s*:\s*['"]json['"]/

export function hasJsonAttribute(content, endOfMatch) {
    const clause = WITH_CLAUSE.exec(
        content.slice(endOfMatch, endOfMatch + ATTRIBUTE_WINDOW),
    )
    return clause !== null && JSON_TYPE.test(clause[1])
}

async function collectSources(dir) {
    let entries
    try {
        entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(
            `Unable to read "${path.relative(repoRoot, dir)}": ${message}. ` +
                'A missing source dir must fail loudly, not pass green with zero coverage.',
            { cause: error },
        )
    }

    const nested = await Promise.all(
        entries.map(async (entry) => {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === 'dist') {
                    return []
                }
                return collectSources(full)
            }
            return /\.(ts|tsx|mts|js|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')
                ? [full]
                : []
        }),
    )
    return nested.flat()
}

/**
 * The single detection implementation. CI runs this and the unit tests cover
 * this. Two copies would let tested behaviour drift from shipped behaviour,
 * which is how a gate quietly stops gating.
 */
export function findBareJsonImports(content) {
    const found = []
    for (const match of content.matchAll(JSON_IMPORT_RE)) {
        if (hasJsonAttribute(content, match.index + match[0].length)) continue
        found.push({
            specifier: match[2],
            line: content.slice(0, match.index).split('\n').length,
        })
    }
    return found
}

// Only scan when executed directly. Importing this file (for the unit tests
// below it) must not run the scan or call process.exit.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const failures = []
    let filesScanned = 0
    let importsFound = 0

    for (const pkg of NODE_ESM_PACKAGES) {
        const src = path.join(repoRoot, 'packages', pkg, 'src')
        let files
        try {
            files = await collectSources(src)
        } catch (error) {
            failures.push(String(error.message))
            continue
        }
        filesScanned += files.length

        for (const file of files) {
            const content = await readFile(file, 'utf8')
            importsFound += (content.match(JSON_IMPORT_RE) ?? []).length
            for (const bare of findBareJsonImports(content)) {
                failures.push(
                    `${path.relative(repoRoot, file)}:${bare.line} imports "${bare.specifier}" ` +
                        `without \`with { type: 'json' }\`. Node refuses this at runtime with ` +
                        `ERR_IMPORT_ATTRIBUTE_MISSING, and neither jest nor \`npm run build\` will tell you.`,
                )
            }
        }
    }

    // Vacuous-pass guard: an empty scan trivially satisfies "no bare imports".
    if (failures.length === 0 && filesScanned === 0) {
        failures.push(
            'scanned ZERO source files across ' +
                NODE_ESM_PACKAGES.join(', ') +
                ' — the walker is broken and this check would pass on anything',
        )
    }

    if (failures.length > 0) {
        console.error('\njson import attribute check FAILED\n')
        for (const failure of failures) console.error(`- ${failure}`)
        console.error('')
        process.exit(1)
    }

    console.log(
        `json import attribute check passed (${importsFound} json import(s) across ` +
            `${filesScanned} files in ${NODE_ESM_PACKAGES.join(', ')}; frontend excluded, vite bundles it).`,
    )
}
