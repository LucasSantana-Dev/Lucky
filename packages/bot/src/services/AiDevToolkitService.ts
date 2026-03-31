import { type Client, type TextChannel, type Message } from 'discord.js'
import { getPrismaClient } from '@lucky/shared/utils'
import { infoLog, errorLog, debugLog } from '@lucky/shared/utils'

const GITHUB_REPO = 'Forge-Space/ai-dev-toolkit'
const BOARD_KEY = 'ai-dev-toolkit-guide'
const DISPLAY_URL = 'https://github.com/Forge-Space/ai-dev-toolkit'
const CHANNEL_ID =
    process.env.AI_DEV_TOOLKIT_CHANNEL_ID ?? '1488340697181585488'
const CHECK_INTERVAL = parseInt(
    process.env.AI_DEV_TOOLKIT_CHECK_INTERVAL ?? String(6 * 60 * 60 * 1000),
)

interface RepoSnapshot {
    commitSha: string
    patterns: string[]
    lastUpdated: string
}

interface StoredGuide {
    messageIds: string[]
}

const PATTERN_DISPLAY: Record<string, string> = {
    'context-building': 'Context Building',
    'prompt-engineering': 'Prompt Engineering',
    'task-orchestration': 'Task Orchestration',
    'multi-model-routing': 'Multi-Model Routing',
    'session-management': 'Session Management',
    'memory-systems': 'Memory Systems',
    'code-review': 'Code Review',
    testing: 'Testing with AI',
    'git-worktrees': 'Git Worktrees',
    'agent-gotchas': 'Agent Gotchas',
    'multi-repo': 'Multi-Repo Workflows',
    'agent-observability': 'Agent Observability',
    'streaming-orchestration': 'Streaming Orchestration',
    'tool-registry-patterns': 'Tool Registry Patterns',
    'permission-boundaries': 'Permission Boundaries',
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
            const timeout = AbortSignal.timeout(10_000)
            const commitRes = await fetch(
                `https://api.github.com/repos/${GITHUB_REPO}/commits/main`,
                { headers: this.githubHeaders(), signal: timeout },
            )

            if (!commitRes.ok) {
                debugLog({
                    message: `AiDevToolkitService: GitHub commit API error ${commitRes.status}`,
                })
                return null
            }

            const commitData = (await commitRes.json()) as {
                sha: string
                commit: {
                    tree: { sha: string }
                    committer: { date: string }
                }
            }

            const treeSha = commitData.commit.tree.sha
            const treeRes = await fetch(
                `https://api.github.com/repos/${GITHUB_REPO}/git/trees/${treeSha}?recursive=1`,
                {
                    headers: this.githubHeaders(),
                    signal: AbortSignal.timeout(10_000),
                },
            )

            if (!treeRes.ok) {
                debugLog({
                    message: `AiDevToolkitService: GitHub tree API error ${treeRes.status}`,
                })
                return null
            }

            const treeData = (await treeRes.json()) as {
                tree: { path: string }[]
            }

            const patterns = treeData.tree
                .map((f) => f.path)
                .filter((p) => p.startsWith('patterns/') && p.endsWith('.md'))
                .map((p) => p.replace('patterns/', '').replace('.md', ''))

            return {
                commitSha: commitData.sha.slice(0, 7),
                patterns,
                lastUpdated: commitData.commit.committer.date,
            }
        } catch (error) {
            errorLog({ message: 'AiDevToolkitService: fetch failed', error })
            return null
        }
    }

    private buildMessages(snapshot: RepoSnapshot): string[] {
        const ts = Math.floor(new Date(snapshot.lastUpdated).getTime() / 1000)
        const base = DISPLAY_URL

        const patternLines = snapshot.patterns
            .map((slug) => `- ${PATTERN_DISPLAY[slug] ?? slug}`)
            .join('\n')

        const msg1 = [
            '# Desenvolvimento com IA: ferramentas, padrões e dicas práticas',
            '',
            'Montei esse repositório para organizar o que venho aprendendo sobre desenvolvimento com IA no dia a dia.',
            '',
            'A ideia não é tratar IA como "gerador mágico de código", mas como parte de um fluxo de desenvolvimento mais consistente, com:',
            '- contexto bem definido',
            '- regras por ferramenta',
            '- padrões de trabalho',
            '- memória',
            '- organização de tarefas',
            '- ambiente preparado para produtividade',
            '',
            `🔗 Repositório:\n<${base}>`,
            '',
            '---',
            '',
            '## 1) Qual é a proposta do repositório',
            '',
            'Muitas sessões de desenvolvimento com IA falham porque o agente não entende o contexto do projeto.',
            '',
            'Por isso, organizei o toolkit com blocos reutilizáveis para ajudar em pontos como:',
            '- alinhar a IA às convenções do projeto',
            '- reduzir retrabalho',
            '- melhorar previsibilidade',
            '- criar continuidade entre sessões',
            '- deixar o uso de IA mais prático no desenvolvimento real',
            '',
            `🔗 Visão geral:\n<${base}/blob/main/README.md>`,
            '',
            `🔗 Por que esse toolkit existe:\n<${base}/blob/main/README.md#why-this-toolkit>`,
        ].join('\n')

        const msg2 = [
            '## 2) O que tem no repositório',
            '',
            '### `patterns/`',
            'Padrões para organizar melhor o uso de IA no desenvolvimento.',
            '',
            'Inclui temas como:',
            patternLines,
            '',
            `🔗 Pasta:\n<${base}/tree/main/patterns>`,
            '',
            `🔗 Mapa no README:\n<${base}/blob/main/README.md#repository-map>`,
            '',
            '### `best-practices/`',
            'Boas práticas que atravessam o workflow inteiro.',
            '',
            'Inclui:',
            '- segurança',
            '- workflow',
            '- otimização de contexto',
            '',
            `🔗 Pasta:\n<${base}/tree/main/best-practices>`,
            '',
            '### `rules/`',
            'Arquivos prontos para configurar o comportamento esperado da IA dependendo da ferramenta.',
            '',
            'Tem templates como:',
            '- `CLAUDE.md`',
            '- `AGENTS.md`',
            '- `.cursorrules`',
            '- `.windsurfrules`',
            '- `COPILOT.md`',
            '',
            `🔗 Pasta:\n<${base}/tree/main/rules>`,
        ].join('\n')

        const msg3 = [
            '### `tools/`',
            'Ferramentas e scripts para produtividade, principalmente no terminal.',
            '',
            'A stack inclui utilitários como:',
            '- lazygit',
            '- fzf',
            '- bat',
            '- eza',
            '- delta',
            '- zoxide',
            '- atuin',
            '- btop',
            '- fd',
            '- ripgrep',
            '- jq',
            '- yq',
            '- chezmoi',
            '',
            'Também deixei referências para integrações e ferramentas complementares voltadas a produtividade com IA.',
            '',
            `🔗 Pasta:\n<${base}/tree/main/tools>`,
            '',
            `🔗 Additions e integrações:\n<${base}/blob/main/tools/README.md#curated-ai-productivity-additions>`,
            '',
            '### `implementations/`',
            'Exemplos mais concretos de uso por ferramenta.',
            '',
            'Inclui implementações para:',
            '- Claude Code',
            '- OpenCode',
            '- Cursor',
            '',
            `🔗 Pasta:\n<${base}/tree/main/implementations>`,
            '',
            '### `examples/`',
            'Exemplos prontos para usar como referência.',
            '',
            'Tem assets como:',
            '- `backlog.json`',
            '- estrutura de memória em `.claude/memory/`',
            '',
            `🔗 Pasta:\n<${base}/tree/main/examples>`,
        ].join('\n')

        const msg4 = [
            '---',
            '',
            '## 3) Alguns pontos importantes que organizei no material',
            '',
            '**Contexto do projeto**',
            'Uma das partes mais importantes é fazer a IA entender o projeto antes de começar a gerar código — estrutura, como rodar, como testar, convenções e workflow.',
            '',
            `🔗 Context Building:\n<${base}/blob/main/patterns/context-building.md>`,
            '',
            '**Orquestração de tarefas**',
            'Em vez de tentar resolver tudo num prompt só, faz mais sentido quebrar tarefas em etapas menores e organizar melhor a execução.',
            '',
            `🔗 Task Orchestration:\n<${base}/blob/main/patterns/task-orchestration.md>`,
            '',
            '**Memória e continuidade**',
            'Registrar decisões, preferências e contexto durável para não precisar repetir tudo a cada sessão.',
            '',
            `🔗 Memory Systems:\n<${base}/blob/main/patterns/memory-systems.md>`,
            '',
            '**Revisão e testes com IA**',
            'O uso de IA não precisa ficar só em geração de código — também faz sentido aplicar em revisão, validação e testes.',
            '',
            `🔗 Code Review:\n<${base}/blob/main/patterns/code-review.md>`,
            `🔗 Testing with AI:\n<${base}/blob/main/patterns/testing.md>`,
        ].join('\n')

        const msg5 = [
            '---',
            '',
            '## 4) Exemplos visuais/práticos dentro do repositório',
            '',
            '**Exemplo de backlog**',
            'Tem um `backlog.json` com estrutura de tarefas, prioridade, status, dependências e tags. Ajuda a pensar em IA trabalhando com fila de execução e organização de trabalho.',
            '',
            `🔗 Exemplo:\n<${base}/blob/main/examples/backlog.json>`,
            '',
            '**Exemplo de memória**',
            'Estrutura de memória em `.claude/memory/` para guardar decisões e contexto reutilizável.',
            '',
            `🔗 Exemplo:\n<${base}/tree/main/examples/.claude/memory>`,
            '',
            '**Implementações por ferramenta**',
            `🔗 Claude Code:\n<${base}/tree/main/implementations/claude-code>`,
            `🔗 OpenCode:\n<${base}/tree/main/implementations/opencode>`,
            `🔗 Cursor:\n<${base}/tree/main/implementations/cursor>`,
            '',
            '---',
            '',
            '## 5) Como começar',
            '',
            'Se alguém quiser aplicar isso no próprio projeto, o caminho mais simples é:',
            '- adicionar um arquivo de regra da ferramenta usada',
            '- começar por Context Building',
            '- depois evoluir para orquestração, revisão, testes e memória',
            '- opcionalmente montar a stack de terminal para produtividade',
            '',
            `🔗 Quick Start:\n<${base}/blob/main/README.md#quick-start>`,
            `🔗 How to Adopt in One Week:\n<${base}/blob/main/README.md#how-to-adopt-in-one-week>`,
            '',
            '---',
            '',
            '## 6) Resumo',
            '',
            'Esse repositório é basicamente uma organização do que venho aprendendo sobre desenvolvimento com IA:',
            '- como dar contexto melhor',
            '- como reduzir respostas genéricas',
            '- como criar regras por ferramenta',
            '- como organizar tarefas',
            '- como manter memória',
            '- como montar um workflow mais confiável',
            '',
            'A proposta é sair do uso improvisado e ir para um uso mais consistente no desenvolvimento real.',
            '',
            `🔗 Repo completo:\n<${base}>`,
            '',
            `*(Atualizado em <t:${ts}:D> · \`${snapshot.commitSha}\`)*`,
        ].join('\n')

        return [msg1, msg2, msg3, msg4, msg5]
    }

    private async getStoredGuide(): Promise<StoredGuide | null> {
        try {
            const prisma = getPrismaClient()
            const board = await prisma.liveBoard.findUnique({
                where: { key: BOARD_KEY },
            })
            if (!board) return null
            const meta = board.metadata as { messageIds?: string[] } | null
            if (meta?.messageIds?.length) {
                return { messageIds: meta.messageIds }
            }
            return { messageIds: [board.messageId] }
        } catch {
            return null
        }
    }

    private async storeGuide(
        channelId: string,
        messageIds: string[],
    ): Promise<void> {
        const prisma = getPrismaClient()
        await prisma.liveBoard.upsert({
            where: { key: BOARD_KEY },
            create: {
                key: BOARD_KEY,
                channelId,
                messageId: messageIds[0],
                metadata: { messageIds },
            },
            update: {
                channelId,
                messageId: messageIds[0],
                metadata: { messageIds },
            },
        })
    }

    async syncBoard(client: Client): Promise<void> {
        const snapshot = await this.fetchRepoSnapshot()
        if (!snapshot) return

        if (snapshot.commitSha === this.lastCommitSha) {
            debugLog({ message: 'AiDevToolkitService: no new commits' })
            return
        }

        const messages = this.buildMessages(snapshot)
        const stored = await this.getStoredGuide()

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

            const existingMessages: Message[] = []
            let foundAllMessages = true
            if (stored?.messageIds.length) {
                for (const id of stored.messageIds) {
                    try {
                        const msg = await channel.messages.fetch(id)
                        existingMessages.push(msg)
                    } catch {
                        foundAllMessages = false
                        break
                    }
                }
            }

            if (
                foundAllMessages &&
                existingMessages.length > 0 &&
                existingMessages.length === messages.length
            ) {
                for (let i = 0; i < messages.length; i++) {
                    await existingMessages[i].edit({
                        content: messages[i],
                        embeds: [],
                        allowedMentions: { parse: [] },
                    })
                }
                infoLog({
                    message: `AiDevToolkitService: updated guide (${snapshot.commitSha})`,
                })
            } else {
                for (const msg of existingMessages) {
                    await msg.delete().catch(() => undefined)
                }
                const postedIds: string[] = []
                for (const content of messages) {
                    const posted = await channel.send({
                        content,
                        allowedMentions: { parse: [] },
                    })
                    postedIds.push(posted.id)
                }
                await this.storeGuide(CHANNEL_ID, postedIds)
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
