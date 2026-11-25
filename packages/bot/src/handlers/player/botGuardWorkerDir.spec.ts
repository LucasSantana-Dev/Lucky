import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
    findSimpleYtdlCoreDistDir,
    pinBotGuardWorkerDir,
    resetBotGuardWorkerDirCache,
} from './botGuardWorkerDir'

type GlobalWithDirname = { __dirname?: string }

describe('botGuardWorkerDir', () => {
    const globalRef = globalThis as GlobalWithDirname
    const originalDirname = globalRef.__dirname
    let tmp: string

    beforeEach(() => {
        resetBotGuardWorkerDirCache()
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'botguard-'))
    })

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true })
        if (originalDirname === undefined) delete globalRef.__dirname
        else globalRef.__dirname = originalDirname
    })

    it('finds the installed simple-ytdl-core dist folder with its worker', () => {
        const dir = findSimpleYtdlCoreDistDir()

        expect(dir).not.toBeNull()
        expect(
            fs.existsSync(path.join(dir as string, 'BotGuard', 'worker.cjs')),
        ).toBe(true)
    })

    it('skips a resolved folder that has no BotGuard worker', () => {
        const entry = path.join(tmp, 'index.cjs')

        expect(findSimpleYtdlCoreDistDir(() => entry)).toBeNull()
    })

    it('skips anchors that cannot resolve the package', () => {
        expect(
            findSimpleYtdlCoreDistDir(() => {
                throw new Error('Cannot find module')
            }),
        ).toBeNull()
    })

    it('points globalThis.__dirname at the worker folder, overriding Prisma', () => {
        globalRef.__dirname = '/app/packages/shared/dist/generated/prisma'

        pinBotGuardWorkerDir(() => tmp)

        expect(globalRef.__dirname).toBe(tmp)
    })

    it('re-pins on every call, since later module loads can reassign it', () => {
        const find = jest.fn(() => tmp)
        pinBotGuardWorkerDir(find)
        globalRef.__dirname = '/somewhere/else'

        pinBotGuardWorkerDir(find)

        expect(globalRef.__dirname).toBe(tmp)
        expect(find).toHaveBeenCalledTimes(1)
    })

    it('throws instead of pinning when the worker cannot be found', () => {
        globalRef.__dirname = '/before'

        expect(() => pinBotGuardWorkerDir(() => null)).toThrow(
            'BotGuard worker not found',
        )
        expect(globalRef.__dirname).toBe('/before')
    })
})
