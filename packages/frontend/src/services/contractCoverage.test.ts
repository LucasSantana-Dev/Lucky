import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const schemasDir = join(here, '../../../backend/src/schemas')
const srcDir = join(here, '..')

// Schema modules with no frontend contract test yet. This list may only
// shrink: the test fails once a listed module gains a test or disappears.
const KNOWN_GAPS = new Set(['moderation'])
const NOT_RESOURCES = new Set(['common', 'index'])

const schemaModules = readdirSync(schemasDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => f.slice(0, -3))
    .filter((m) => !NOT_RESOURCES.has(m))

const contractFiles = ['services', 'types'].flatMap((dir) =>
    readdirSync(join(srcDir, dir))
        .filter((f) => /contract.*\.test\.ts$/i.test(f))
        .map((f) => readFileSync(join(srcDir, dir, f), 'utf8')),
)

// Only a real `from '...'` import counts, not a comment or string mention.
const importSpecifiers = (text: string) =>
    [...text.matchAll(/\bfrom\s+(['"])([^'"\n]+)\1/g)].map((x) => x[2])

const importsSchema = (text: string, m: string) =>
    importSpecifiers(text).some((s) => s.endsWith(`backend/src/schemas/${m}`))

const hasContract = (m: string) =>
    contractFiles.some((text) => importsSchema(text, m))

describe('backend schema contract coverage', () => {
    test('importsSchema counts single and double quoted imports only', () => {
        const dir = '../../../backend/src/schemas/x'
        expect(importsSchema(`import { a } from '${dir}'`, 'x')).toBe(true)
        expect(importsSchema(`import { a } from "${dir}"`, 'x')).toBe(true)
        expect(importsSchema(`// ${dir}`, 'x')).toBe(false)
        expect(importsSchema(`const s = '${dir}'`, 'x')).toBe(false)
        expect(importsSchema(`import { a } from '${dir}y'`, 'x')).toBe(false)
    })

    test.each(schemaModules.filter((m) => !KNOWN_GAPS.has(m)))(
        'schema module %s has a frontend contract test',
        (m) => {
            expect(
                hasContract(m),
                `backend/src/schemas/${m}.ts has no frontend *contract*.test.ts importing it`,
            ).toBe(true)
        },
    )

    test.each([...KNOWN_GAPS])(
        'known gap %s still exists and still has no contract test',
        (m) => {
            expect(
                schemaModules,
                `${m} no longer exists: remove it from KNOWN_GAPS`,
            ).toContain(m)
            expect(
                hasContract(m),
                `${m} now has a contract test: remove it from KNOWN_GAPS`,
            ).toBe(false)
        },
    )
})
