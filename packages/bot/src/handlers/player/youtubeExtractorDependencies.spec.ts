import { describe, expect, it } from '@jest/globals'
import { builtinModules } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

// discord-player-youtubei 3.1.0 imports simple-ytdl-core without declaring it.
// The bot loads the extractor with a dynamic import, so a missing package only
// shows up at runtime as "YouTube extractor unavailable after retries"
// (2026-10-20). simple-ytdl-core 1.1.1 in turn imports bgutils-js and
// googlevideo as devDependencies only. Every bare import of the dist files of
// both packages must resolve from where the package is installed.
const EXTRACTOR = 'discord-player-youtubei'
const RUNTIME_PACKAGES: Array<[string, string]> = [
    [EXTRACTOR, 'youtubei.js'],
    ['simple-ytdl-core', 'bgutils-js'],
]

function findPackageDir(name: string, fromDir: string): string | null {
    let dir = fromDir
    while (true) {
        const candidate = path.join(dir, 'node_modules', name, 'package.json')
        if (fs.existsSync(candidate)) return path.dirname(candidate)
        const parent = path.dirname(dir)
        if (parent === dir) return null
        dir = parent
    }
}

function packageName(specifier: string): string {
    const parts = specifier.split('/')
    return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

function bareImports(source: string): string[] {
    const specifiers = [
        ...source.matchAll(/from\s+"([^"]+)"/g),
        ...source.matchAll(/require\("([^"]+)"\)/g),
        ...source.matchAll(/import\(\s*"([^"]+)"\s*\)/g),
    ].map((match) => match[1])
    return [
        ...new Set(
            specifiers
                .filter((s) => !s.startsWith('.') && !s.startsWith('node:'))
                .filter((s) => !builtinModules.includes(s))
                .map(packageName),
        ),
    ].sort()
}

describe('discord-player-youtubei runtime dependencies', () => {
    const extractorDir = findPackageDir(EXTRACTOR, __dirname)

    it('is installed', () => {
        expect(extractorDir).not.toBeNull()
    })

    it.each(
        RUNTIME_PACKAGES.flatMap(([name, expected]) =>
            ['index.mjs', 'index.cjs'].map((file) => [name, file, expected]),
        ),
    )('resolves every bare import of %s dist/%s', (name, file, expected) => {
        const packageDir = findPackageDir(name, extractorDir as string)
        expect(packageDir).not.toBeNull()

        const source = fs.readFileSync(
            path.join(packageDir as string, 'dist', file),
            'utf8',
        )
        const imports = bareImports(source)
        expect(imports).toContain(expected)

        const missing = imports.filter(
            (dep) => findPackageDir(dep, packageDir as string) === null,
        )
        expect(missing).toEqual([])
    })
})
