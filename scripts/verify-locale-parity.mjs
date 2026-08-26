import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Verifies the bot's locale catalogues carry the same key set.
//
// A key present in en.json and missing from pt-BR.json does NOT break at
// runtime: i18next's fallbackLng quietly serves the English string. That is the
// desired behaviour in production and exactly why the gap is invisible without
// a check. Whole features can sit untranslated with nothing to show for it.
//
// Built to fail rather than pass vacuously, same as
// verify-nginx-route-parity.mjs: a parser that reads nothing would otherwise
// report perfect parity across zero keys.

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const LOCALES_DIR = path.join(repoRoot, 'packages/bot/src/locales')

const REFERENCE = 'en'

// Catalogues that MUST exist. Discovery below adds anything else it finds, so a
// fourth locale is covered the moment its file lands; this list is what makes
// DELETING or renaming one of the three loud instead of silently shrinking the
// gate's scope to whatever happens to be on disk.
const REQUIRED_LOCALES = ['en', 'pt-BR', 'es']

/**
 * Every catalogue actually present. Reading the directory rather than trusting
 * a hardcoded list is the point: with a fixed list, both the load loop and the
 * count guard below referenced the SAME constant, so a new fr.json was ignored
 * by the loop and the guard agreed with itself that nothing was missing.
 */
async function discoverLocales() {
    const entries = await readdir(LOCALES_DIR, { withFileTypes: true })
    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => entry.name.slice(0, -'.json'.length))
        .sort()
}

let LOCALES
try {
    LOCALES = await discoverLocales()
} catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
        `\nlocale parity check FAILED\n\n- cannot read ${path.relative(repoRoot, LOCALES_DIR)}: ${message}. ` +
            'A missing catalogue directory must fail loudly, not pass green with zero coverage.\n',
    )
    process.exit(1)
}

// Keys deliberately present in ONE locale only, with the reason. An entry here
// must still exist in the reference catalogue, so a rename cannot leave a stale
// exemption silently covering nothing.
const INTENTIONALLY_ENGLISH_ONLY = new Map([
    [
        'music.queue.fallbackProbe',
        'Exists in en.json only ON PURPOSE. It is what makes the fallbackLng ' +
            'test in i18n/index.spec.ts real: translating it would turn that ' +
            'assertion back into a no-op that passes with fallback broken.',
    ],
])

function flatten(obj, prefix = '') {
    const out = []
    for (const [key, value] of Object.entries(obj)) {
        const full = prefix ? `${prefix}.${key}` : key
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            out.push(...flatten(value, full))
        } else {
            out.push(full)
        }
    }
    return out
}

const failures = []
const keysByLocale = new Map()

for (const locale of LOCALES) {
    const file = path.join(LOCALES_DIR, `${locale}.json`)
    try {
        const parsed = JSON.parse(await readFile(file, 'utf8'))
        keysByLocale.set(locale, new Set(flatten(parsed)))
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        failures.push(`cannot read ${locale}.json: ${message}`)
    }
}

// --- Vacuous-pass guards -------------------------------------------------
// An empty key set trivially satisfies "no missing keys".
if (failures.length === 0) {
    for (const required of REQUIRED_LOCALES) {
        if (!keysByLocale.has(required)) {
            failures.push(
                `required catalogue ${required}.json is missing. It was deleted or renamed; ` +
                    'update REQUIRED_LOCALES on purpose rather than letting the gate quietly ' +
                    'stop covering that language.',
            )
        }
    }
    if (keysByLocale.size !== LOCALES.length) {
        failures.push(
            `discovered ${LOCALES.length} catalogues but loaded ${keysByLocale.size}`,
        )
    }
    for (const [locale, keys] of keysByLocale) {
        if (keys.size === 0) {
            failures.push(`${locale}.json parsed to ZERO keys`)
        }
    }
    const reference = keysByLocale.get(REFERENCE)
    for (const [key] of INTENTIONALLY_ENGLISH_ONLY) {
        if (reference && !reference.has(key)) {
            failures.push(
                `exemption "${key}" is not in ${REFERENCE}.json. It was renamed or ` +
                    'removed, so the exemption now covers nothing. Drop it.',
            )
        }
    }
}

// --- Parity ---------------------------------------------------------------
if (failures.length === 0) {
    const reference = keysByLocale.get(REFERENCE)

    for (const [locale, keys] of keysByLocale) {
        if (locale === REFERENCE) continue

        for (const key of reference) {
            if (keys.has(key)) continue
            if (INTENTIONALLY_ENGLISH_ONLY.has(key)) continue
            failures.push(`${locale}.json is missing "${key}"`)
        }

        for (const key of keys) {
            if (reference.has(key)) continue
            failures.push(
                `${locale}.json has "${key}", which does not exist in ${REFERENCE}.json. ` +
                    'Either it was renamed in the reference and not here, or it is a typo ' +
                    'that no call site will ever ask for.',
            )
        }

        for (const key of INTENTIONALLY_ENGLISH_ONLY.keys()) {
            if (keys.has(key)) {
                failures.push(
                    `${locale}.json translates "${key}", which is exempt for a reason: ` +
                        INTENTIONALLY_ENGLISH_ONLY.get(key),
                )
            }
        }
    }
}

if (failures.length > 0) {
    console.error('locale parity check FAILED\n')
    for (const failure of failures) console.error(`- ${failure}`)
    console.error(
        '\n  A missing key does not throw: i18next serves the English string via ' +
            'fallbackLng.\n  That is correct at runtime and is why this gate exists, ' +
            'since nothing else\n  would ever surface the gap.',
    )
    process.exit(1)
}

const total = keysByLocale.get(REFERENCE).size
console.log(
    `locale parity check passed (${LOCALES.length} catalogues, ${total} keys in ${REFERENCE}, ` +
        `${INTENTIONALLY_ENGLISH_ONLY.size} documented exemption(s)).`,
)
