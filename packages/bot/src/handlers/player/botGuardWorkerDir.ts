import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

// simple-ytdl-core starts its BotGuard worker with
//   new Worker(path.join(__dirname, 'BotGuard', 'worker.cjs'))
// from its ESM build, where `__dirname` is not a module variable but whatever
// sits on globalThis. The Prisma generated client and the Prisma runtime both
// assign globalThis.__dirname to their own folder when they load, so the
// worker path became packages/shared/dist/generated/prisma/BotGuard/worker.cjs.
// The worker then fails to start, simple-ytdl-core rethrows that from the
// worker's 'error' listener, and the whole bot exits on an uncaught exception
// (LUCKY-8Q, a crash loop on 2026-11-25 from 05:47 to 10:08 UTC).
//
// Before every youtubei stream we point globalThis.__dirname at
// simple-ytdl-core's own dist folder. Nothing else reads the global after
// load: Prisma only writes it in its module banner.

const WORKER_FILE = path.join('BotGuard', 'worker.cjs')

let cachedDistDir: string | null = null

function anchors(): string[] {
    const list: string[] = []
    if (process.argv[1]) list.push(process.argv[1])
    list.push(path.join(process.cwd(), 'index.js'))
    return list
}

/**
 * simple-ytdl-core's dist folder, if its BotGuard worker file is there.
 * `resolve` is injectable for tests.
 */
export function findSimpleYtdlCoreDistDir(
    resolve: (anchor: string) => string = (anchor) =>
        createRequire(anchor).resolve('simple-ytdl-core'),
): string | null {
    for (const anchor of anchors()) {
        try {
            const dir = path.dirname(resolve(anchor))
            if (fs.existsSync(path.join(dir, WORKER_FILE))) return dir
        } catch {
            // Not resolvable from this anchor; try the next one.
        }
    }
    return null
}

/**
 * Points globalThis.__dirname at simple-ytdl-core's dist folder so its
 * BotGuard worker starts from the right file. Throws when the worker file
 * cannot be found, so the caller falls back to another source instead of
 * letting simple-ytdl-core crash the process.
 */
export function pinBotGuardWorkerDir(
    find: () => string | null = findSimpleYtdlCoreDistDir,
): void {
    if (!cachedDistDir) cachedDistDir = find()
    if (!cachedDistDir) {
        throw new Error(
            'youtubei: simple-ytdl-core BotGuard worker not found, skipping',
        )
    }
    ;(globalThis as { __dirname?: string }).__dirname = cachedDistDir
}

/** Test hook: forget the cached folder. */
export function resetBotGuardWorkerDirCache(): void {
    cachedDistDir = null
}
