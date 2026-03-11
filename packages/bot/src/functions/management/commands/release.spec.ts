import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import releaseCommand from './release'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    buildPreviewPayload,
    buildReleaseEmbeds,
    publishReleaseMessages,
    resolveEnglishReleaseData,
    resolvePortugueseSections,
    CRIATIVARIA_RELEASE_CHANNEL_ID,
} from '../handlers/releaseNotesPublisher'

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: jest.fn(),
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('../handlers/releaseNotesPublisher', () => ({
    resolveEnglishReleaseData: jest.fn(),
    resolvePortugueseSections: jest.fn(),
    buildReleaseEmbeds: jest.fn(),
    buildPreviewPayload: jest.fn(),
    publishReleaseMessages: jest.fn(),
    CRIATIVARIA_RELEASE_CHANNEL_ID: '1481201519545028618',
}))

function createInteraction(options: {
    subcommand: 'preview' | 'publish'
    version: string | null
    ptAdded: string
    ptChanged: string
    ptFixed: string
}) {
    return {
        guild: { id: '895505900016631839', name: 'Criativaria' },
        user: { tag: 'lucky#0001' },
        options: {
            getSubcommand: jest.fn(() => options.subcommand),
            getString: jest.fn((name: string) => {
                if (name === 'version') return options.version
                if (name === 'pt_added') return options.ptAdded
                if (name === 'pt_changed') return options.ptChanged
                if (name === 'pt_fixed') return options.ptFixed
                return null
            }),
        },
        client: { channels: { fetch: jest.fn() } },
    } as any
}

describe('/release command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(resolveEnglishReleaseData as jest.Mock).mockReturnValue({
            version: '2.6.9',
            date: '2026-03-10',
            sections: { added: ['a'], changed: ['b'], fixed: ['c'] },
        })
        ;(resolvePortugueseSections as jest.Mock).mockReturnValue({
            added: ['pt-a'],
            changed: ['pt-b'],
            fixed: ['pt-c'],
        })
        ;(buildReleaseEmbeds as jest.Mock).mockReturnValue({
            ptEmbed: { toJSON: () => ({ title: 'pt' }) },
            enEmbed: { toJSON: () => ({ title: 'en' }) },
        })
    })

    it('defines preview and publish subcommands with required PT options', () => {
        const json = releaseCommand.data.toJSON()
        const preview = json.options?.find(
            (option) => option.name === 'preview',
        )
        const publish = json.options?.find(
            (option) => option.name === 'publish',
        )

        expect(preview).toBeDefined()
        expect(publish).toBeDefined()

        const previewOptions =
            preview?.options?.map((option) => option.name) ?? []
        const publishOptions =
            publish?.options?.map((option) => option.name) ?? []

        expect(previewOptions).toEqual(
            expect.arrayContaining([
                'version',
                'pt_added',
                'pt_changed',
                'pt_fixed',
            ]),
        )
        expect(publishOptions).toEqual(
            expect.arrayContaining([
                'version',
                'pt_added',
                'pt_changed',
                'pt_fixed',
            ]),
        )
    })

    it('returns preview embeds without publishing to channel', async () => {
        ;(buildPreviewPayload as jest.Mock).mockReturnValue({
            embeds: [{ title: 'pt' }, { title: 'en' }],
            files: [{}, {}],
        })

        const interaction = createInteraction({
            subcommand: 'preview',
            version: null,
            ptAdded: 'A',
            ptChanged: '-',
            ptFixed: '-',
        })

        await releaseCommand.execute({ interaction } as any)

        expect(buildPreviewPayload).toHaveBeenCalledTimes(1)
        expect(publishReleaseMessages).not.toHaveBeenCalled()
        expect(interactionReply).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction,
                content: expect.objectContaining({
                    embeds: expect.any(Array),
                    files: expect.any(Array),
                    ephemeral: true,
                }),
            }),
        )
    })

    it('publishes release notes to fixed channel and replies success', async () => {
        ;(publishReleaseMessages as jest.Mock).mockResolvedValue(undefined)

        const interaction = createInteraction({
            subcommand: 'publish',
            version: '2.6.9',
            ptAdded: 'A',
            ptChanged: 'B',
            ptFixed: 'C',
        })

        await releaseCommand.execute({ interaction } as any)

        expect(publishReleaseMessages).toHaveBeenCalledTimes(1)
        expect(interactionReply).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction,
                content: expect.objectContaining({
                    content: expect.stringContaining(
                        CRIATIVARIA_RELEASE_CHANNEL_ID,
                    ),
                    ephemeral: true,
                }),
            }),
        )
    })

    it('reports helper errors as ephemeral failure', async () => {
        ;(resolveEnglishReleaseData as jest.Mock).mockImplementation(() => {
            throw new Error('Version not found')
        })

        const interaction = createInteraction({
            subcommand: 'publish',
            version: '9.9.9',
            ptAdded: 'A',
            ptChanged: '-',
            ptFixed: '-',
        })

        await releaseCommand.execute({ interaction } as any)

        expect(interactionReply).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction,
                content: expect.objectContaining({
                    content: expect.stringContaining('Version not found'),
                    ephemeral: true,
                }),
            }),
        )
    })
})
