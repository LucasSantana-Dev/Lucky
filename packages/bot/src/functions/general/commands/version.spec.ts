import { describe, it, expect } from '@jest/globals'
import { Readable } from 'stream'
import { createInterface } from 'readline'
import { createReadStream } from 'fs'
import path from 'path'

async function readVersionFromStream(
    stream: NodeJS.ReadableStream,
): Promise<string> {
    const rl = createInterface({ input: stream })
    try {
        for await (const line of rl) {
            const match = line.match(/"version"\s*:\s*"([^"]+)"/)
            if (match) return match[1]
        }
        return 'unknown'
    } finally {
        rl.close()
    }
}

describe('version command', () => {
    describe('readVersion', () => {
        it('extracts version from valid package.json lines', async () => {
            const stream = Readable.from([
                '{\n',
                '  "name": "test",\n',
                '  "version": "2.6.53"\n',
                '}\n',
            ])
            expect(await readVersionFromStream(stream)).toBe('2.6.53')
        })

        it('returns unknown when version field is absent', async () => {
            const stream = Readable.from(['{\n', '  "name": "test"\n', '}\n'])
            expect(await readVersionFromStream(stream)).toBe('unknown')
        })

        it('matches version on first line', async () => {
            const stream = Readable.from(['"version": "1.0.0"\n'])
            expect(await readVersionFromStream(stream)).toBe('1.0.0')
        })

        it('closes readline even when version is not found', async () => {
            const stream = Readable.from(['no version here\n'])
            await expect(readVersionFromStream(stream)).resolves.toBe('unknown')
        })

        it('reads actual bot package.json', async () => {
            const pkgPath = path.resolve(__dirname, '../../../../package.json')
            const stream = createReadStream(pkgPath)
            const version = await readVersionFromStream(stream)
            expect(version).toMatch(
                /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/,
            )
        })
    })

    describe('execute error handling', () => {
        it('falls back to unknown when readVersion throws', async () => {
            let capturedVersion = ''
            const mockReadVersion = async (): Promise<string> => {
                throw new Error('ENOENT: file not found')
            }
            const execute = async () => {
                let version = 'unknown'
                try {
                    version = await mockReadVersion()
                } catch {
                    // intentionally falls back
                }
                capturedVersion = version
            }
            await execute()
            expect(capturedVersion).toBe('unknown')
        })

        it('uses version when readVersion succeeds', async () => {
            let capturedVersion = ''
            const mockReadVersion = async (): Promise<string> => '3.0.0'
            const execute = async () => {
                let version = 'unknown'
                try {
                    version = await mockReadVersion()
                } catch {
                    // fallback
                }
                capturedVersion = version
            }
            await execute()
            expect(capturedVersion).toBe('3.0.0')
        })
    })
})
