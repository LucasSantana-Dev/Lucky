import {
    EmbedBuilder,
    type Client,
    type TextChannel,
    type Message,
} from 'discord.js'
import { getPrismaClient } from '@lucky/shared/utils'
import { infoLog, errorLog, debugLog } from '@lucky/shared/utils'

const GITHUB_REPO = 'Forge-Space/ai-dev-toolkit'
const BOARD_KEY = 'ai-dev-toolkit-guide'
const CHANNEL_ID =
    process.env.AI_DEV_TOOLKIT_CHANNEL_ID ?? '1488340697181585488'
const CHECK_INTERVAL = parseInt(
    process.env.AI_DEV_TOOLKIT_CHECK_INTERVAL ?? String(6 * 60 * 60 * 1000),
)
const EMBED_COLOR = '#8b5cf6' as `#${string}`
const GITHUB_BASE = `https://github.com/${GITHUB_REPO}`

interface RepoSnapshot {
    commitSha: string
    patterns: PatternEntry[]
    companies: string[]
    lastUpdated: string
}

interface PatternEntry {
    name: string
    slug: string
    when: string
}

const PATTERN_META: Record<string, string> = {
    'context-building': 'Agent lacks project knowledge',
    'prompt-engineering': 'Responses are imprecise or inconsistent',
    'task-orchestration': 'Multi-step work needs less supervision',
    'multi-model-routing': 'Cost or latency needs reducing',
    'session-management': 'Parallel sessions conflict or diverge',
    'memory-systems': 'Decisions need to persist across sessions',
    'code-review': 'Catching bugs and risky changes',
    'testing': 'Generating higher-value tests',
    'git-worktrees': 'Isolating concurrent tasks safely',
    'agent-gotchas': 'Avoiding common AI workflow failures',
    'multi-repo': 'Coordinating changes across repositories',
    'agent-observability': 'Tracing, evaluating, and regression-testing agent behaviour',
    'streaming-orchestration': 'Event-driven turn loops, budgeting, compaction',
    'tool-registry-patterns': 'Decoupling tool metadata from implementation',
    'permission-boundaries': 'Minimum-privilege access and confirmation gates',
}

function slugToTitle(slug: string): string {
    return slug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
}

class AiDevToolkitService {
    private intervalId: ReturnType<typeof setInterval> | null = null
    private lastCommitSha: string | null = null

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

    private githubHeaders(): Record<string, string> {
        return {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            ...(process.env.GITHUB_TOKEN
                ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
                : {}),
        }
    }

    private async fetchRepoSnapshot(): Promise<RepoSnapshot | null> {
        try {
            const [commitRes, treeRes] = await Promise.all([
                fetch(
                    `https://api.github.com/repos/${GITHUB_REPO}/commits/main`,
                    { headers: this.githubHeaders() },
                ),
                fetch(
                    `https://api.github.com/repos/${GITHUB_REPO}/git/trees/main?recursive=1`,
                    { headers: this.githubHeaders() },
                ),
            ])

            if (!commitRes.ok || !treeRes.ok) {
                debugLog({
                    message: `AiDevToolkitService: GitHub API error ${commitRes.status}/${treeRes.status}`,
                })
                return null
            }

            const [commitData, treeData] = await Promise.all([
                commitRes.json() as Promise<{
                    sha: string
                    commit: { committer: { date: string } }
                }>,
                treeRes.json() as Promise<{ tree: { path: string }[] }>,
            ])

            const patternFiles = treeData.tree
                .map((f) => f.path)
                .filter(
                    (p) =>
                        p.startsWith('patterns/') && p.endsWith('.md'),
                )
                .map((p) => p.replace('patterns/', '').replace('.md', ''))

            const patterns: PatternEntry[] = patternFiles.map((slug) => ({
                name: slugToTitle(slug),
                slug,
                when: PATTERN_META[slug] ?? '',
            }))

            const companyDirs = treeData.tree
                .filter(
                    (f) =>
                        f.path.match(/^companies\/[^\/]+\/?$/) &&
                        !f.path.endsWith('/'),
                )
                .map((f) => f.path.replace('companies/', ''))

            return {
                commitSha: commitData.sha.slice(0, 7),
                patterns,
                companies: companyDirs,
                lastUpdated: commitData.commit.committer.date,
            }
        } catch (error) {
            errorLog({ message: 'AiDevToolkitService: fetch failed', error })
            return null
        }
    }

    private buildGuideEmbed(snapshot: RepoSnapshot): EmbedBuilder {
        const patternList = snapshot.patterns
            .map(
                (p) =>
                    `**[${p.name}](${GITHUB_BASE}/blob/main/patterns/${p.slug}.md)**${p.when ? ` — ${p.when}` : ''}`,
            )
            .join('\n')

        const updatedAt = new Date(snapshot.lastUpdated)
        const timestamp = Math.floor(updatedAt.getTime() / 1000)

        return new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setAuthor({
                name: 'Forge Space • ai-dev-toolkit',
                url: GITHUB_BASE,
            })
            .setTitle('Build with AI — for real')
            .setURL(GITHUB_BASE)
            .setDescription(
                [
                    'Most AI coding sessions fail for one reason: **the agent has no project context.**',
                    '',
                    'ai-dev-toolkit gives your agent what it needs from day one — rule templates, context patterns, orchestration playbooks, and productivity scripts. The result is predictable output, less rework, and faster delivery.',
                    '',
                    `→ **[GitHub Repository](${GITHUB_BASE})** · **[Releases](${GITHUB_BASE}/releases)**`,
                ].join('\n'),
            )
            .addFields(
                {
                    name: '⚡ Quick Start',
                    value: [
                        '**1.** Copy a rule file to your project',
                        '```',
                        'cp rules/CLAUDE.md your-project/CLAUDE.md',
                        '```',
                        `**2.** Read [Context Building](${GITHUB_BASE}/blob/main/patterns/context-building.md) — the foundation for everything else`,
                        '**3.** Run the setup script *(optional)*',
                        '```',
                        'bash tools/setup-claude-code.sh',
                        '```',
                    ].join('\n'),
                    inline: false,
                },
                {
                    name: `📚 Patterns (${snapshot.patterns.length})`,
                    value:
                        patternList.length > 1024
                            ? patternList.slice(0, 1020) + '…'
                            : patternList,
                    inline: false,
                },
                {
                    name: '📋 Rule Templates',
                    value: [
                        `[CLAUDE.md](${GITHUB_BASE}/blob/main/rules/CLAUDE.md) — Claude Code / OpenCode`,
                        `[AGENTS.md](${GITHUB_BASE}/blob/main/rules/AGENTS.md) — Codex CLI / OpenCode`,
                        `[.cursorrules](${GITHUB_BASE}/blob/main/rules/.cursorrules) — Cursor`,
                        `[.windsurfrules](${GITHUB_BASE}/blob/main/rules/.windsurfrules) — Windsurf`,
                        `[COPILOT.md](${GITHUB_BASE}/blob/main/rules/COPILOT.md) — GitHub Copilot`,
                    ].join('\n'),
                    inline: true,
                },
                {
                    name: '🛠️ Setup Scripts',
                    value: [
                        `[setup-claude-code.sh](${GITHUB_BASE}/blob/main/tools/setup-claude-code.sh) — Full Claude Code config`,
                        `[install-macos.sh](${GITHUB_BASE}/blob/main/tools/install-macos.sh) — macOS terminal stack`,
                        `[install-ubuntu.sh](${GITHUB_BASE}/blob/main/tools/install-ubuntu.sh) — Ubuntu stack`,
                        `[setup-ai-workflow-macos.sh](${GITHUB_BASE}/blob/main/tools/setup-ai-workflow-macos.sh) — AI tools`,
                    ].join('\n'),
                    inline: true,
                },
                {
                    name: '📅 Last Updated',
                    value: `<t:${timestamp}:D> · \`${snapshot.commitSha}\``,
                    inline: false,
                },
            )
            .setFooter({
                text: 'ai-dev-toolkit • Patterns & tools for AI-assisted development',
            })
            .setTimestamp()
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
        const snapshot = await this.fetchRepoSnapshot()
        if (!snapshot) return

        if (snapshot.commitSha === this.lastCommitSha) {
            debugLog({ message: 'AiDevToolkitService: no new commits' })
            return
        }

        const embed = this.buildGuideEmbed(snapshot)
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
                    message: `AiDevToolkitService: updated guide (${snapshot.commitSha})`,
                })
            } else {
                const posted = await channel.send({ embeds: [embed] })
                await this.storeBoard(CHANNEL_ID, posted.id)
                infoLog({
                    message: `AiDevToolkitService: posted guide (${snapshot.commitSha})`,
                })
            }

            this.lastCommitSha = snapshot.commitSha
        } catch (error) {
            errorLog({ message: 'AiDevToolkitService: Discord error', error })
        }
    }
}

export const aiDevToolkitService = new AiDevToolkitService()
