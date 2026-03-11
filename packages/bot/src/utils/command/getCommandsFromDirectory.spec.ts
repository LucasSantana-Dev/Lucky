import { afterEach, describe, expect, it, jest } from '@jest/globals'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { getCommandFiles } from './getCommandsFromDirectory'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))

jest.mock('@lucky/shared/config', () => ({
    config: () => ({
        COMMAND_CATEGORIES_DISABLED: [],
        COMMANDS_DISABLED: [],
    }),
}))

let tempDir: string | null = null

afterEach(async () => {
    if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true })
        tempDir = null
    }
})

describe('getCommandsFromDirectory', () => {
    it('ignores test/spec files when listing command modules', async () => {
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
    })
})
