import fs from 'node:fs'
import path from 'node:path'

// Discord voice is end-to-end encrypted (DAVE). discord-voip encrypts every
// opus packet through @snazzah/davey. davey 0.2 only gets a key after
// prepareTransition/executeTransition run following each MLS commit or
// welcome; discord-voip 7.2.0 was written for 0.1 and never calls them, so
// with davey 0.2 the bot streamed audio nobody could decrypt: tracks
// "played" in the logs and the voice channel stayed silent (2.75.0,
// 2026-11-25). This guards the pairing until discord-voip catches up.

function findPackageDir(name: string, fromDir: string): string {
    let dir = fromDir
    while (true) {
        const candidate = path.join(dir, 'node_modules', name, 'package.json')
        if (fs.existsSync(candidate)) return path.dirname(candidate)
        const parent = path.dirname(dir)
        if (parent === dir) throw new Error(`${name} is not installed`)
        dir = parent
    }
}

describe('DAVE voice encryption dependencies', () => {
    const voipDir = findPackageDir('discord-voip', __dirname)
    const daveyDir = findPackageDir('@snazzah/davey', voipDir)

    it('pairs davey with a discord-voip that drives its key transitions', () => {
        const daveyTypes = fs.readFileSync(
            path.join(daveyDir, 'index.d.ts'),
            'utf8',
        )
        const needsTransitions = /\bprepareTransition\s*\(/.test(daveyTypes)
        if (!needsTransitions) return

        const voipSource = fs.readFileSync(
            path.join(voipDir, 'dist', 'index.js'),
            'utf8',
        )
        // discord-voip has its own prepareTransition/executeTransition
        // wrappers; what matters is that they reach the davey session.
        expect(voipSource).toMatch(/session\??\.prepareTransition\(/)
        expect(voipSource).toMatch(/session\??\.executeTransition\(/)
    })
})
