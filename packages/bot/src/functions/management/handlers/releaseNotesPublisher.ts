import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import {
    AttachmentBuilder,
    EmbedBuilder,
    type ChatInputCommandInteraction,
    type Channel,
} from 'discord.js'

export const CRIATIVARIA_RELEASE_CHANNEL_ID = '1481201519545028618'

const CHANGELOG_PATH = 'CHANGELOG.md'
const BANNER_ASSET_PATH = 'assets/branding/lucky-banner-neon.png'
const MARK_ASSET_PATH = 'assets/branding/lucky-mark-neon.png'

type ReleaseSectionKey = 'added' | 'changed' | 'fixed'

export type ReleaseSections = Record<ReleaseSectionKey, string[]>

export type ReleaseData = {
    version: string
    date: string | null
    sections: ReleaseSections
}

export type PortugueseReleaseInput = {
    added: string
    changed: string
    fixed: string
}

export type BrandAssets = {
    bannerPath: string
    markPath: string
}

type ReleaseBlock = {
    version: string
    date: string | null
    body: string
}

type SendableChannel = {
    id: string
    send: (_payload: unknown) => Promise<unknown>
}

const SECTION_LABELS: Record<ReleaseSectionKey, string> = {
    added: 'Added',
    changed: 'Changed',
    fixed: 'Fixed',
}

const SECTION_LABELS_PT: Record<ReleaseSectionKey, string> = {
    added: 'Adicionado',
    changed: 'Alterado',
    fixed: 'Corrigido',
}

function normalizeVersion(version: string | null): string | null {
    if (!version) return null
    const clean = version.trim().replace(/^v/i, '')
    return clean.length > 0 ? clean : null
}

function truncateText(value: string, maxLength: number): string {
    const clean = value.trim().replace(/\s+/g, ' ')
    if (clean.length <= maxLength) return clean
    return `${clean.slice(0, maxLength - 1)}…`
}

function parseManualBullets(value: string): string[] {
    const trimmed = value.trim()
    if (trimmed === '-' || trimmed.length === 0) return []

    return trimmed
        .split(/[\n;|]/g)
        .map((item) => item.replace(/^[-•\s]+/, '').trim())
        .filter((item) => item.length > 0)
        .slice(0, 4)
        .map((item) => truncateText(item, 180))
}

function formatSectionValue(bullets: string[]): string {
    if (bullets.length === 0) return '—'
    return bullets.map((bullet) => `• ${bullet}`).join('\n')
}

function parseReleaseBlocks(changelog: string): ReleaseBlock[] {
    const headingRegex = /^## \[(.+?)\](?:\s*-\s*(.+))?$/gm
    const matches = Array.from(changelog.matchAll(headingRegex))
    const blocks: ReleaseBlock[] = []

    for (let i = 0; i < matches.length; i++) {
        const match = matches[i]
        const rawVersion = match[1]?.trim()
        if (!rawVersion || rawVersion.toLowerCase() === 'unreleased') {
            continue
        }

        const bodyStart = (match.index ?? 0) + match[0].length
        const nextStart = matches[i + 1]?.index ?? changelog.length
        const body = changelog.slice(bodyStart, nextStart).trim()
        blocks.push({
            version: rawVersion,
            date: match[2]?.trim() ?? null,
            body,
        })
    }

    return blocks
}

function parseSections(body: string): ReleaseSections {
    const sections: ReleaseSections = {
        added: [],
        changed: [],
        fixed: [],
    }

    const lines = body.split(/\r?\n/)
    let activeSection: ReleaseSectionKey | null = null

    for (const line of lines) {
        const sectionMatch = line.match(/^###\s+(.+)$/)
        if (sectionMatch) {
            const normalized = sectionMatch[1].trim().toLowerCase()
            if (
                normalized === 'added' ||
                normalized === 'changed' ||
                normalized === 'fixed'
            ) {
                activeSection = normalized
            } else {
                activeSection = null
            }
            continue
        }

        if (!activeSection) {
            continue
        }

        const bulletMatch = line.match(/^\s*-\s+(.+)$/)
        if (bulletMatch) {
            sections[activeSection].push(bulletMatch[1].trim())
            continue
        }

        const continuation = line.trim()
        if (continuation.length === 0) {
            continue
        }

        const index = sections[activeSection].length - 1
        if (index >= 0) {
            sections[activeSection][index] =
                `${sections[activeSection][index]} ${continuation}`
        }
    }

    return sections
}

function buildKeyBullets(bullets: string[]): string[] {
    return bullets.slice(0, 4).map((bullet) => truncateText(bullet, 180))
}

function resolveProjectPath(relativePath: string): string {
    const direct = path.resolve(process.cwd(), relativePath)
    if (existsSync(direct)) {
        return direct
    }
    return path.resolve(process.cwd(), '..', '..', relativePath)
}

function readChangelog(): string {
    const changelogPath = resolveProjectPath(CHANGELOG_PATH)
    if (!existsSync(changelogPath)) {
        throw new Error(`CHANGELOG not found at ${CHANGELOG_PATH}`)
    }

    const content = readFileSync(changelogPath, 'utf-8')
    if (content.trim().length === 0) {
        throw new Error('CHANGELOG is empty')
    }
    return content
}

function selectReleaseBlock(
    changelog: string,
    requestedVersion: string | null,
): ReleaseBlock {
    const blocks = parseReleaseBlocks(changelog)
    if (blocks.length === 0) {
        throw new Error('No released version sections found in CHANGELOG')
    }

    if (!requestedVersion) {
        return blocks[0]
    }

    const normalizedRequested = normalizeVersion(requestedVersion)
    const selected = blocks.find(
        (block) => normalizeVersion(block.version) === normalizedRequested,
    )

    if (!selected) {
        throw new Error(`Version ${requestedVersion} not found in CHANGELOG`)
    }

    return selected
}

function toSendableChannel(channel: Channel | null): SendableChannel | null {
    if (
        !channel ||
        !('send' in channel) ||
        typeof channel.send !== 'function'
    ) {
        return null
    }

    return channel as unknown as SendableChannel
}

function buildAssets(): BrandAssets {
    const bannerPath = resolveProjectPath(BANNER_ASSET_PATH)
    const markPath = resolveProjectPath(MARK_ASSET_PATH)

    if (!existsSync(bannerPath)) {
        throw new Error(`Brand asset not found: ${BANNER_ASSET_PATH}`)
    }

    if (!existsSync(markPath)) {
        throw new Error(`Brand asset not found: ${MARK_ASSET_PATH}`)
    }

    return { bannerPath, markPath }
}

function buildFiles(assets: BrandAssets): AttachmentBuilder[] {
    return [
        new AttachmentBuilder(assets.bannerPath, {
            name: 'lucky-banner-neon.png',
        }),
        new AttachmentBuilder(assets.markPath, {
            name: 'lucky-mark-neon.png',
        }),
    ]
}

export function resolveEnglishReleaseData(version: string | null): ReleaseData {
    const changelog = readChangelog()
    const block = selectReleaseBlock(changelog, version)
    const parsedSections = parseSections(block.body)

    return {
        version: block.version,
        date: block.date,
        sections: {
            added: buildKeyBullets(parsedSections.added),
            changed: buildKeyBullets(parsedSections.changed),
            fixed: buildKeyBullets(parsedSections.fixed),
        },
    }
}

export function resolvePortugueseSections(
    input: PortugueseReleaseInput,
): ReleaseSections {
    const sections: ReleaseSections = {
        added: parseManualBullets(input.added),
        changed: parseManualBullets(input.changed),
        fixed: parseManualBullets(input.fixed),
    }

    const totalItems =
        sections.added.length + sections.changed.length + sections.fixed.length
    if (totalItems === 0) {
        throw new Error(
            'Portuguese sections cannot all be empty. Use at least one bullet item.',
        )
    }

    return sections
}

export function buildReleaseEmbeds(
    releaseData: ReleaseData,
    portugueseSections: ReleaseSections,
): { ptEmbed: EmbedBuilder; enEmbed: EmbedBuilder } {
    const dateSuffix = releaseData.date ? ` • ${releaseData.date}` : ''

    const ptEmbed = new EmbedBuilder()
        .setColor(0xff58e4)
        .setTitle(`Lucky ${releaseData.version} • Atualizações`)
        .setDescription(`Notas da versão${dateSuffix}`)
        .setImage('attachment://lucky-banner-neon.png')
        .setThumbnail('attachment://lucky-mark-neon.png')
        .setTimestamp()

    const enEmbed = new EmbedBuilder()
        .setColor(0xffc66e)
        .setTitle(`Lucky ${releaseData.version} • Release Notes`)
        .setDescription(`Version update${dateSuffix}`)
        .setImage('attachment://lucky-banner-neon.png')
        .setThumbnail('attachment://lucky-mark-neon.png')
        .setTimestamp()

    for (const key of Object.keys(SECTION_LABELS) as ReleaseSectionKey[]) {
        ptEmbed.addFields({
            name: SECTION_LABELS_PT[key],
            value: formatSectionValue(portugueseSections[key]),
            inline: false,
        })
        enEmbed.addFields({
            name: SECTION_LABELS[key],
            value: formatSectionValue(releaseData.sections[key]),
            inline: false,
        })
    }

    return { ptEmbed, enEmbed }
}

export function buildPreviewPayload(
    ptEmbed: EmbedBuilder,
    enEmbed: EmbedBuilder,
): { embeds: EmbedBuilder[]; files: AttachmentBuilder[] } {
    const assets = buildAssets()
    return {
        embeds: [ptEmbed, enEmbed],
        files: buildFiles(assets),
    }
}

export async function publishReleaseMessages(
    interaction: ChatInputCommandInteraction,
    ptEmbed: EmbedBuilder,
    enEmbed: EmbedBuilder,
): Promise<void> {
    const channel = await interaction.client.channels.fetch(
        CRIATIVARIA_RELEASE_CHANNEL_ID,
    )
    const sendableChannel = toSendableChannel(channel)
    if (!sendableChannel) {
        throw new Error(
            `Target channel ${CRIATIVARIA_RELEASE_CHANNEL_ID} is not sendable`,
        )
    }

    const assets = buildAssets()

    await sendableChannel.send({
        embeds: [ptEmbed],
        files: buildFiles(assets),
        allowedMentions: { parse: [] },
    })

    await sendableChannel.send({
        embeds: [enEmbed],
        files: buildFiles(assets),
        allowedMentions: { parse: [] },
    })
}
