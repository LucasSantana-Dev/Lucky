import {
    EmbedBuilder,
    type Client,
    type TextChannel,
    type Message,
} from 'discord.js'
import { getPrismaClient } from '@lucky/shared/utils'
import { infoLog, errorLog, debugLog } from '@lucky/shared/utils'

const GITHUB_REPO = 'Forge-Space/ai-dev-toolkit'
const BOARD_KEY = 'ai-dev-toolkit-releases'
const CHANNEL_ID =
    process.env.AI_DEV_TOOLKIT_CHANNEL_ID ?? '1488340697181585488'
const CHECK_INTERVAL = parseInt(
    process.env.AI_DEV_TOOLKIT_CHECK_INTERVAL ?? String(6 * 60 * 60 * 1000),
)
const EMBED_COLOR = '#8b5cf6' as `#${string}`

interface GitHubRelease {
    tag_name: string
    name: string
    body: string
    published_at: string
    html_url: string
}

class AiDevToolkitService {
    private intervalId: ReturnType<typeof setInterval> | null = null
    private lastVersion: string | null = null

    async start(client: Client): Promise<void> {
        await this.syncBoard(client)
        this.intervalId = setInterval(() => {
            this.syncBoard(client).catch((error) => {
                errorLog({ message: 'AiDevToolkitService: sync error', error })
            })
        }, CHECK_INTERVAL)
        infoLog({
            message: `AiDevToolkitService started (interval: ${CHECK_INTERVAL}ms)`,
        })
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
            infoLog({ message: 'AiDevToolkitService stopped' })
        }
    }

    private async fetchLatestRelease(): Promise<GitHubRelease | null> {
        try {
            const res = await fetch(
                `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
                {
                    headers: {
                        Accept: 'application/vnd.github+json',
                        'X-GitHub-Api-Version': '2022-11-28',
                        ...(process.env.GITHUB_TOKEN
                            ? {
                                  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                              }
                            : {}),
                    },
                },
            )
            if (!res.ok) {
                debugLog({
                    message: `AiDevToolkitService: GitHub API returned ${res.status}`,
                })
                return null
            }
            return (await res.json()) as GitHubRelease
        } catch (error) {
            errorLog({ message: 'AiDevToolkitService: fetch failed', error })
            return null
        }
    }

    private buildEmbed(release: GitHubRelease): EmbedBuilder {
        const notes = this.formatNotes(release.body)
        const releasedAt = new Date(release.published_at)

        return new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setAuthor({
                name: 'Forge Space • ai-dev-toolkit',
                url: `https://github.com/${GITHUB_REPO}`,
            })
            .setTitle(`What's New — ${release.tag_name}`)
            .setURL(release.html_url)
            .setDescription(notes)
            .addFields(
                {
                    name: 'Version',
                    value: `\`${release.tag_name}\``,
                    inline: true,
                },
                {
                    name: 'Released',
                    value: `<t:${Math.floor(releasedAt.getTime() / 1000)}:D>`,
                    inline: true,
                },
                {
                    name: 'Links',
                    value: `[GitHub Release](${release.html_url}) · [Full Changelog](https://github.com/${GITHUB_REPO}/blob/main/CHANGELOG.md)`,
                    inline: false,
                },
            )
            .setFooter({
                text: 'ai-dev-toolkit • Patterns & tools for AI-assisted development',
            })
            .setTimestamp()
    }

    private formatNotes(body: string): string {
        const cleaned = body
            .replace(/^## \[.*?\] - \d{4}-\d{2}-\d{2}\n?/, '')
            .trim()
        return cleaned.length > 2800
            ? `${cleaned.slice(0, 2800)}\u2026`
            : cleaned
    }

    private async getStoredBoard(): Promise<{
        channelId: string
        messageId: string
    } | null> {
        try {
            const prisma = getPrismaClient()
            const board = await prisma.liveBoard.findUnique({
                where: { key: BOARD_KEY },
            })
            return board
                ? { channelId: board.channelId, messageId: board.messageId }
                : null
        } catch {
            return null
        }
    }

    private async storeBoard(
        channelId: string,
        messageId: string,
    ): Promise<void> {
        const prisma = getPrismaClient()
        await prisma.liveBoard.upsert({
            where: { key: BOARD_KEY },
            create: { key: BOARD_KEY, channelId, messageId },
            update: { channelId, messageId },
        })
    }

    async syncBoard(client: Client): Promise<void> {
        const release = await this.fetchLatestRelease()
        if (!release) return

        if (release.tag_name === this.lastVersion) {
            debugLog({ message: 'AiDevToolkitService: no new release' })
            return
        }

        const embed = this.buildEmbed(release)
        const stored = await this.getStoredBoard()

        try {
            const channel = (await client.channels.fetch(
                CHANNEL_ID,
            )) as TextChannel | null
            if (!channel?.isTextBased()) {
                errorLog({
                    message: `AiDevToolkitService: channel ${CHANNEL_ID} not found or not text-based`,
                })
                return
            }

            let existingMessage: Message | null = null
            if (stored) {
                try {
                    existingMessage = await channel.messages.fetch(
                        stored.messageId,
                    )
                } catch {
                    debugLog({
                        message:
                            'AiDevToolkitService: stored message not found, will re-post',
                    })
                }
            }

            if (existingMessage) {
                await existingMessage.edit({ embeds: [embed] })
                infoLog({
                    message: `AiDevToolkitService: updated board to ${release.tag_name}`,
                })
            } else {
                const posted = await channel.send({ embeds: [embed] })
                await this.storeBoard(CHANNEL_ID, posted.id)
                infoLog({
                    message: `AiDevToolkitService: posted new board for ${release.tag_name}`,
                })
            }

            this.lastVersion = release.tag_name
        } catch (error) {
            errorLog({ message: 'AiDevToolkitService: Discord error', error })
        }
    }
}

export const aiDevToolkitService = new AiDevToolkitService()
