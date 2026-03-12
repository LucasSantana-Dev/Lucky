import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import fs from 'node:fs/promises'
import Module from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { errorLog } from '@lucky/shared/utils'
import { getCommandFiles, getCommandsFromDirectory } from './getCommandsFromDirectory'

const mockConfig = {
    COMMAND_CATEGORIES_DISABLED: [] as string[],
    COMMANDS_DISABLED: [] as string[],
}

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))

jest.mock('@lucky/shared/config', () => ({
    config: () => mockConfig,
}))

let tempDir: string | null = null
const mockErrorLog = errorLog as jest.MockedFunction<typeof errorLog>

beforeEach(() => {
    mockConfig.COMMAND_CATEGORIES_DISABLED = []
    mockConfig.COMMANDS_DISABLED = []
    mockErrorLog.mockClear()
    const originalRequire = Module.prototype.require
    jest.spyOn(Module.prototype, 'require').mockImplementation(function (id: string) {
        if (id.startsWith('file://')) {
            return originalRequire.call(this, fileURLToPath(id))
        }
        return originalRequire.call(this, id)
    })
}

afterEach(async () => {
    jest.restoreAllMocks()
    if (tempDir) {
        await fs.rm(tempDir, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 50,
        })
        tempDir = null
    }
})

describe('getCommandsFromDirectory', () => {
    it(
        'ignores test/spec files when listing command modules',
        async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lucky-cmd-loader-'))

        await fs.writeFile(
            path.join(tempDir, 'valid.js'),
            "export default { data: { name: 'valid' }, execute: async () => {} }\n",
            'utf8',
        )

        await fs.writeFile(
            path.join(tempDir, 'ignore.spec.js'),
            "export default { data: { name: 'spec' }, execute: async () => {} }\n",
            'utf8',
        )

        await fs.writeFile(
            path.join(tempDir, 'ignore.test.js'),
            "export default { data: { name: 'test' }, execute: async () => {} }\n",
            'utf8',
        )

        const files = getCommandFiles(tempDir)
        expect(files).toEqual(['valid.js'])
        },
        30_000,
    )

    it('prefers JavaScript files when both JS and TS command files exist', async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lucky-cmd-loader-'))
        await fs.writeFile(path.join(tempDir, 'alpha.ts'), 'export default {}\n', 'utf8')
        await fs.writeFile(path.join(tempDir, 'alpha.js'), 'export default {}\n', 'utf8')
        await fs.writeFile(path.join(tempDir, 'index.ts'), 'export default {}\n', 'utf8')
        await fs.writeFile(path.join(tempDir, 'types.d.ts'), 'export type X = string\n', 'utf8')

        expect(getCommandFiles(tempDir)).toEqual(['alpha.js'])
    })

    it('returns empty list when category is disabled by config', async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lucky-cmd-loader-'))
        mockConfig.COMMAND_CATEGORIES_DISABLED = ['management']

        const commands = await getCommandsFromDirectory({
            url: tempDir,
            category: 'management',
        })

        expect(commands).toEqual([])
    })

    it('loads commands and filters disabled command names', async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lucky-cmd-loader-'))

        await fs.writeFile(
            path.join(tempDir, 'allowed.js'),
            "module.exports = { data: { name: 'allowed' }, execute: async () => {} }\n",
            'utf8',
        )

        await fs.writeFile(
            path.join(tempDir, 'blocked.js'),
            "module.exports = { data: { name: 'blocked' }, execute: async () => {} }\n",
            'utf8',
        )

        mockConfig.COMMANDS_DISABLED = ['blocked']

        const commands = await getCommandsFromDirectory({ url: tempDir })
        expect(commands.map((command) => command.data.name)).toEqual(['allowed'])
    })

    it('skips invalid command modules and modules that throw during import', async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lucky-cmd-loader-'))

        await fs.writeFile(
            path.join(tempDir, 'valid.js'),
            "module.exports = { data: { name: 'valid' }, execute: async () => {} }\n",
            'utf8',
        )
        await fs.writeFile(
            path.join(tempDir, 'invalid.js'),
            "module.exports = { data: { name: 'invalid' } }\n",
            'utf8',
        )
        await fs.writeFile(path.join(tempDir, 'broken.js'), "throw new Error('boom')\n", 'utf8')

        const commands = await getCommandsFromDirectory({ url: tempDir })
        expect(commands.map((command) => command.data.name)).toEqual(['valid'])
        expect(mockErrorLog).toHaveBeenCalled()
    })

    it('returns empty list and logs when directory does not exist', async () => {
        const missingDir = path.join(os.tmpdir(), `lucky-missing-${Date.now()}`)
        const commands = await getCommandsFromDirectory({ url: missingDir })

        expect(commands).toEqual([])
        expect(mockErrorLog).toHaveBeenCalled()
    })
})
