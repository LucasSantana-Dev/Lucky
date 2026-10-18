import {
    beforeEach,
    afterEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'

const warnLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

import {
    HOSTED_COMMAND_NAMES,
    getFullCommandsGuildIds,
    isCommandAvailableInGuild,
    isHostedMusicOnlyCommands,
    splitCommandsForRegistration,
    __resetHostedCommandsWarnStateForTests,
} from './hostedCommands'

const OPERATOR_GUILD = '111111111111111111'
const OTHER_GUILD = '222222222222222222'

describe('hostedCommands', () => {
    const originalMusicOnly = process.env.HOSTED_MUSIC_ONLY_COMMANDS
    const originalGuilds = process.env.FULL_COMMANDS_GUILD_IDS

    beforeEach(() => {
        warnLogMock.mockClear()
        __resetHostedCommandsWarnStateForTests()
        delete process.env.HOSTED_MUSIC_ONLY_COMMANDS
        delete process.env.FULL_COMMANDS_GUILD_IDS
    })

    afterEach(() => {
        if (originalMusicOnly === undefined) {
            delete process.env.HOSTED_MUSIC_ONLY_COMMANDS
        } else {
            process.env.HOSTED_MUSIC_ONLY_COMMANDS = originalMusicOnly
        }
        if (originalGuilds === undefined) {
            delete process.env.FULL_COMMANDS_GUILD_IDS
        } else {
            process.env.FULL_COMMANDS_GUILD_IDS = originalGuilds
        }
    })

    describe('HOSTED_COMMAND_NAMES', () => {
        // The issue's target is about 15; the picker leak was about 90.
        it('stays a short list', () => {
            expect(HOSTED_COMMAND_NAMES.size).toBeLessThanOrEqual(20)
        })

        it.each(['play', 'skip', 'queue', 'recap', 'help'])(
            'includes /%s',
            (name) => {
                expect(HOSTED_COMMAND_NAMES.has(name)).toBe(true)
            },
        )

        // A typo here would silently drop a command from the hosted picker.
        it.each([...HOSTED_COMMAND_NAMES])('/%s has a command file', (name) => {
            const functionsDir = path.join(__dirname, '..', 'functions')
            const found = fs
                .readdirSync(functionsDir)
                .some((category) =>
                    [`${name}.ts`, path.join(name, 'index.ts')].some((file) =>
                        fs.existsSync(
                            path.join(functionsDir, category, 'commands', file),
                        ),
                    ),
                )
            expect(found).toBe(true)
        })

        it.each(['vaga', 'ban', 'automod', 'giveaway', 'serversetup'])(
            'leaves out /%s',
            (name) => {
                expect(HOSTED_COMMAND_NAMES.has(name)).toBe(false)
            },
        )
    })

    describe('isHostedMusicOnlyCommands', () => {
        it('is on when unset, so the hosted bot needs no env change', () => {
            expect(isHostedMusicOnlyCommands()).toBe(true)
        })

        it.each(['false', '0', ' FALSE '])('is off for %p', (value) => {
            process.env.HOSTED_MUSIC_ONLY_COMMANDS = value
            expect(isHostedMusicOnlyCommands()).toBe(false)
        })

        it('keeps music-only on an unrecognized value and warns once', () => {
            process.env.HOSTED_MUSIC_ONLY_COMMANDS = 'flase'
            expect(isHostedMusicOnlyCommands()).toBe(true)
            expect(isHostedMusicOnlyCommands()).toBe(true)
            expect(warnLogMock).toHaveBeenCalledTimes(1)
        })
    })

    describe('getFullCommandsGuildIds', () => {
        it('is empty when unset', () => {
            expect(getFullCommandsGuildIds()).toEqual([])
        })

        it('parses, trims, dedupes and drops non-ids', () => {
            process.env.FULL_COMMANDS_GUILD_IDS = ` ${OPERATOR_GUILD}, nope,,${OTHER_GUILD},${OPERATOR_GUILD}`
            expect(getFullCommandsGuildIds()).toEqual([
                OPERATOR_GUILD,
                OTHER_GUILD,
            ])
        })
    })

    describe('splitCommandsForRegistration', () => {
        const commands = [{ name: 'play' }, { name: 'vaga' }, { name: 'ban' }]

        it('keeps only the music set global by default', () => {
            expect(splitCommandsForRegistration(commands)).toEqual({
                global: [{ name: 'play' }],
                guildOnly: [{ name: 'vaga' }, { name: 'ban' }],
            })
        })

        it('registers everything globally when music-only is off', () => {
            process.env.HOSTED_MUSIC_ONLY_COMMANDS = 'false'
            expect(splitCommandsForRegistration(commands)).toEqual({
                global: commands,
                guildOnly: [],
            })
        })
    })

    describe('isCommandAvailableInGuild', () => {
        it('allows music commands everywhere', () => {
            expect(isCommandAvailableInGuild('play', OTHER_GUILD)).toBe(true)
            expect(isCommandAvailableInGuild('play', null)).toBe(true)
        })

        it('hides other commands outside the full-command guilds', () => {
            process.env.FULL_COMMANDS_GUILD_IDS = OPERATOR_GUILD
            expect(isCommandAvailableInGuild('ban', OTHER_GUILD)).toBe(false)
            expect(isCommandAvailableInGuild('ban', null)).toBe(false)
            expect(isCommandAvailableInGuild('ban', OPERATOR_GUILD)).toBe(true)
        })

        it('allows everything when music-only is off', () => {
            process.env.HOSTED_MUSIC_ONLY_COMMANDS = '0'
            expect(isCommandAvailableInGuild('ban', OTHER_GUILD)).toBe(true)
        })
    })
})
