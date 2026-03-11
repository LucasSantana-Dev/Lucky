import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const existsSyncMock = jest.fn()
const readFileSyncMock = jest.fn()

jest.mock('node:fs', () => ({
    existsSync: (...args: unknown[]) => existsSyncMock(...args),
    readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
}))

import {
    buildPreviewPayload,
    buildReleaseEmbeds,
    publishReleaseMessages,
    resolveEnglishReleaseData,
    resolvePortugueseSections,
    CRIATIVARIA_RELEASE_CHANNEL_ID,
} from './releaseNotesPublisher'

const SAMPLE_CHANGELOG = `# Changelog

## [Unreleased]

### Added
- Not released yet

## [2.6.9] - 2026-03-10

### Added
- Added release publisher command with local assets and channel delivery.
- Added parser integration for changelog sections.

### Changed
- Changed deployment docs for release flow.
- Changed embed styling to Lucky neon identity.

### Fixed
- Fixed command ordering in release output.

## [2.6.8] - 2026-03-09

### Added
- Added another release.
`

function makeInteraction(sendMock: jest.Mock) {
    return {
        client: {
            channels: {
                fetch: jest.fn().mockResolvedValue({
                    id: CRIATIVARIA_RELEASE_CHANNEL_ID,
                    send: sendMock,
                }),
            },
        },
    } as any
}

describe('releaseNotesPublisher', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        existsSyncMock.mockReturnValue(true)
        readFileSyncMock.mockReturnValue(SAMPLE_CHANGELOG)
    })

    it('resolves latest release section when version is omitted', () => {
        const release = resolveEnglishReleaseData(null)

        expect(release.version).toBe('2.6.9')
        expect(release.date).toBe('2026-03-10')
        expect(release.sections.added.length).toBe(2)
        expect(release.sections.changed.length).toBe(2)
        expect(release.sections.fixed.length).toBe(1)
    })

    it('resolves explicit version with v-prefix support', () => {
        const release = resolveEnglishReleaseData('v2.6.8')

        expect(release.version).toBe('2.6.8')
        expect(release.sections.added).toEqual(['Added another release.'])
    })

    it('throws when version is missing in changelog', () => {
        expect(() => resolveEnglishReleaseData('9.9.9')).toThrow(
            'Version 9.9.9 not found in CHANGELOG',
        )
    })

    it('parses portuguese sections and accepts none marker', () => {
        const sections = resolvePortugueseSections({
            added: 'Item A; Item B',
            changed: '-',
            fixed: 'Item C',
        })

        expect(sections.added).toEqual(['Item A', 'Item B'])
        expect(sections.changed).toEqual([])
        expect(sections.fixed).toEqual(['Item C'])
    })

    it('throws when portuguese sections are all empty', () => {
        expect(() =>
            resolvePortugueseSections({
                added: '-',
                changed: '-',
                fixed: '-',
            }),
        ).toThrow('Portuguese sections cannot all be empty')
    })

    it('builds embeds with localized section headers and branded attachment refs', () => {
        const release = resolveEnglishReleaseData(null)
        const ptSections = resolvePortugueseSections({
            added: 'Adicionado um comando',
            changed: 'Fluxo atualizado',
            fixed: 'Bug resolvido',
        })

        const { ptEmbed, enEmbed } = buildReleaseEmbeds(release, ptSections)

        expect(ptEmbed.toJSON().title).toContain('Atualizações')
        expect(enEmbed.toJSON().title).toContain('Release Notes')
        expect(ptEmbed.toJSON().image?.url).toBe(
            'attachment://lucky-banner-neon.png',
        )
        expect(enEmbed.toJSON().thumbnail?.url).toBe(
            'attachment://lucky-mark-neon.png',
        )

        const ptFields = ptEmbed.toJSON().fields ?? []
        const enFields = enEmbed.toJSON().fields ?? []
        expect(ptFields.map((field) => field.name)).toEqual([
            'Adicionado',
            'Alterado',
            'Corrigido',
        ])
        expect(enFields.map((field) => field.name)).toEqual([
            'Added',
            'Changed',
            'Fixed',
        ])
    })

    it('keeps embed field values within Discord limits', () => {
        const longBullet = 'x'.repeat(600)
        const release = resolveEnglishReleaseData(null)
        const ptSections = resolvePortugueseSections({
            added: `${longBullet}; ${longBullet}; ${longBullet}; ${longBullet}`,
            changed: `${longBullet}; ${longBullet}; ${longBullet}; ${longBullet}`,
            fixed: `${longBullet}; ${longBullet}; ${longBullet}; ${longBullet}`,
        })

        const { ptEmbed, enEmbed } = buildReleaseEmbeds(release, ptSections)
        const ptFields = ptEmbed.toJSON().fields ?? []
        const enFields = enEmbed.toJSON().fields ?? []

        for (const field of [...ptFields, ...enFields]) {
            expect((field.value ?? '').length).toBeLessThanOrEqual(1024)
        }
    })

    it('builds preview payload with two embeds and two attachments', () => {
        const release = resolveEnglishReleaseData(null)
        const ptSections = resolvePortugueseSections({
            added: 'A',
            changed: '-',
            fixed: '-',
        })
        const { ptEmbed, enEmbed } = buildReleaseEmbeds(release, ptSections)

        const payload = buildPreviewPayload(ptEmbed, enEmbed)

        expect(payload.embeds).toHaveLength(2)
        expect(payload.files).toHaveLength(2)
    })

    it('publishes in PT then EN order with mentions disabled', async () => {
        const sendMock = jest.fn().mockResolvedValue(undefined)
        const interaction = makeInteraction(sendMock)
        const release = resolveEnglishReleaseData(null)
        const ptSections = resolvePortugueseSections({
            added: 'Adicionado um comando',
            changed: '-',
            fixed: '-',
        })
        const { ptEmbed, enEmbed } = buildReleaseEmbeds(release, ptSections)

        await publishReleaseMessages(interaction, ptEmbed, enEmbed)

        expect(interaction.client.channels.fetch).toHaveBeenCalledWith(
            CRIATIVARIA_RELEASE_CHANNEL_ID,
        )
        expect(sendMock).toHaveBeenCalledTimes(2)

        const firstPayload = sendMock.mock.calls[0][0]
        const secondPayload = sendMock.mock.calls[1][0]

        expect(firstPayload.embeds[0].toJSON().title).toContain('Atualizações')
        expect(secondPayload.embeds[0].toJSON().title).toContain(
            'Release Notes',
        )
        expect(firstPayload.allowedMentions).toEqual({ parse: [] })
        expect(secondPayload.allowedMentions).toEqual({ parse: [] })
    })

    it('fails when target channel is not sendable', async () => {
        const interaction = {
            client: {
                channels: {
                    fetch: jest
                        .fn()
                        .mockResolvedValue({
                            id: CRIATIVARIA_RELEASE_CHANNEL_ID,
                        }),
                },
            },
        } as any

        const release = resolveEnglishReleaseData(null)
        const ptSections = resolvePortugueseSections({
            added: 'x',
            changed: '-',
            fixed: '-',
        })
        const { ptEmbed, enEmbed } = buildReleaseEmbeds(release, ptSections)

        await expect(
            publishReleaseMessages(interaction, ptEmbed, enEmbed),
        ).rejects.toThrow('is not sendable')
    })

    it('fails when branded assets are missing', () => {
        existsSyncMock.mockImplementation((value: string) => {
            if (value.includes('lucky-mark-neon.png')) return false
            return true
        })

        const release = resolveEnglishReleaseData(null)
        const ptSections = resolvePortugueseSections({
            added: 'x',
            changed: '-',
            fixed: '-',
        })
        const { ptEmbed, enEmbed } = buildReleaseEmbeds(release, ptSections)

        expect(() => buildPreviewPayload(ptEmbed, enEmbed)).toThrow(
            'Brand asset not found: assets/branding/lucky-mark-neon.png',
        )
    })
})
