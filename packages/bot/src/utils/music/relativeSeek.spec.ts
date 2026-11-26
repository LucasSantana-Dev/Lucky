jest.mock('../../i18n/acknowledgeAndTranslate', () => ({
    acknowledgeAndTranslate: jest.fn(async () =>
        jest
            .requireActual<typeof import('../../i18n')>('../../i18n')
            .translatorFor('en'),
    ),
}))

jest.mock('../general/interactionReply', () => ({
    interactionReply: jest.fn(),
}))

jest.mock('../command/commandValidations', () => ({
    requireQueue: jest.fn(async () => true),
    requireCurrentTrack: jest.fn(async () => true),
    requireIsPlaying: jest.fn(async () => true),
    requireSameVoiceChannel: jest.fn(async () => true),
    requireDJRoleInGuild: jest.fn(async () => true),
}))

jest.mock('../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: jest.fn(),
}))

jest.mock('../general/responseEmbeds', () => ({
    buildCommandTrackEmbed: jest.fn((_track: unknown, status: string) => ({
        status,
    })),
}))

import { seekRelative } from './relativeSeek'
import { interactionReply } from '../general/interactionReply'
import {
    requireCurrentTrack,
    requireDJRoleInGuild,
    requireIsPlaying,
    requireQueue,
    requireSameVoiceChannel,
} from '../command/commandValidations'
import { resolveGuildQueue } from '../../services/musicManagement/queueResolver'

const MINUTE = 60_000

function setup({
    positionMs = MINUTE,
    durationMS = (3 * MINUTE) as number | undefined,
    seconds = null as number | null,
} = {}) {
    const seek = jest.fn().mockResolvedValue(true)
    const queue = {
        currentTrack: { title: 'Song', durationMS },
        node: {
            seek,
            getTimestamp: () => ({ current: { value: positionMs } }),
        },
    }
    ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })
    const interaction = {
        guildId: 'guild-1',
        user: { id: 'user-1' },
        options: { getInteger: jest.fn(() => seconds) },
    }
    return { seek, params: { client: {}, interaction } as never }
}

const replied = () => (interactionReply as jest.Mock).mock.calls[0][0].content

describe('seekRelative', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(requireSameVoiceChannel as jest.Mock).mockResolvedValue(true)
        ;(requireDJRoleInGuild as jest.Mock).mockResolvedValue(true)
        ;(requireIsPlaying as jest.Mock).mockResolvedValue(true)
        ;(requireQueue as jest.Mock).mockResolvedValue(true)
        ;(requireCurrentTrack as jest.Mock).mockResolvedValue(true)
    })

    it('jumps 10 seconds ahead when no amount is given', async () => {
        const { seek, params } = setup()

        await seekRelative(params, 'forward')

        expect(seek).toHaveBeenCalledWith(MINUTE + 10_000)
        expect(replied().embeds[0].status).toBe('⏩ Jumped ahead to 1:10')
    })

    it('goes back by the amount given', async () => {
        const { seek, params } = setup({ seconds: 30 })

        await seekRelative(params, 'rewind')

        expect(seek).toHaveBeenCalledWith(MINUTE - 30_000)
        expect(replied().embeds[0].status).toBe('⏪ Went back to 0:30')
    })

    it('rewinds to the start instead of before it', async () => {
        const { seek, params } = setup({ positionMs: 4000, seconds: 30 })

        await seekRelative(params, 'rewind')

        expect(seek).toHaveBeenCalledWith(0)
    })

    it('refuses to jump past the end of the song', async () => {
        const { seek, params } = setup({
            positionMs: 3 * MINUTE - 5000,
            seconds: 10,
        })

        await seekRelative(params, 'forward')

        expect(seek).not.toHaveBeenCalled()
        expect(replied().ephemeral).toBe(true)
        expect(replied().content).toContain('past the end')
    })

    it('jumps into the last second of the song', async () => {
        const { seek, params } = setup({
            positionMs: 3 * MINUTE - 10_500,
            seconds: 10,
        })

        await seekRelative(params, 'forward')

        expect(seek).toHaveBeenCalledWith(3 * MINUTE - 500)
    })

    it('rewinds a very short track to the start', async () => {
        const { seek, params } = setup({ positionMs: 400, durationMS: 800 })

        await seekRelative(params, 'rewind')

        expect(seek).toHaveBeenCalledWith(0)
    })

    it('says so for a track without a known length', async () => {
        const { seek, params } = setup({ durationMS: 0 })

        await seekRelative(params, 'forward')

        expect(seek).not.toHaveBeenCalled()
        expect(replied().content).toContain("can't be moved")
    })

    it.each([
        ['outside the voice channel', requireSameVoiceChannel],
        ['without the DJ role', requireDJRoleInGuild],
        ['without a queue', requireQueue],
        ['without a current track', requireCurrentTrack],
        ['while nothing is playing', requireIsPlaying],
    ])('does nothing %s', async (_label, guard) => {
        ;(guard as jest.Mock).mockResolvedValue(false)
        const { seek, params } = setup()

        await seekRelative(params, 'forward')

        expect(seek).not.toHaveBeenCalled()
        expect(interactionReply).not.toHaveBeenCalled()
    })
})
