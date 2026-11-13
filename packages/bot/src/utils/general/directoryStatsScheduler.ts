import { infoLog, warnLog } from '@lucky/shared/utils'
import { captureMessage } from '../monitoring/sentry'

import { IntervalScheduler } from './IntervalScheduler'

// Same cadence as the top.gg scheduler.
const DEFAULT_TICK_INTERVAL_MS = 30 * 60 * 1000
const FETCH_TIMEOUT_MS = 10_000
const REJECTED_STATUS = new Set([401, 403])
// Same rule as top.gg: a lone timeout or 5xx heals next tick, so Sentry only hears
// about an outage after this many failed ticks in a row.
const REPORT_AFTER_CONSECUTIVE_FAILURES = 3

// discordbotlist.com also lists the bot's slash commands on its page, taken from
// the same JSON the bot registers with Discord.
const DBL_NAME = 'discordbotlist.com'
const DBL_COMMANDS_URL = (id: string) =>
    `https://discordbotlist.com/api/v1/bots/${id}/commands`

type Directory = {
    name: string
    tokenEnv: string
    url: (botId: string) => string
    body: (guildCount: number) => Record<string, number>
}

// Each directory is posted to through its own stats API and enabled by its own env
// var. BotBlock was skipped: its list registry is mostly defunct entries, one shared
// rate limit couples the lists, and it hides which list rejected which token.
const DIRECTORIES: Directory[] = [
    {
        name: DBL_NAME,
        tokenEnv: 'DISCORDBOTLIST_TOKEN',
        url: (id) => `https://discordbotlist.com/api/v1/bots/${id}/stats`,
        body: (guilds) => ({ guilds }),
    },
    {
        name: 'discord.bots.gg',
        tokenEnv: 'DISCORD_BOTS_GG_TOKEN',
        url: (id) => `https://discord.bots.gg/api/v1/bots/${id}/stats`,
        body: (guildCount) => ({ guildCount }),
    },
]

type Options = { tickIntervalMs?: number; fetch?: typeof fetch }

export class DirectoryStatsScheduler extends IntervalScheduler {
    private readonly fetchFn: typeof fetch
    private readonly disabled = new Set<string>()
    private readonly failures = new Map<string, number>()
    private loggedMissingTokens = false
    private pendingCommands: unknown[] | null = null

    constructor(options: Options = {}) {
        super(options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS)
        this.fetchFn = options.fetch ?? fetch
    }

    /**
     * The commands registered globally, posted to discordbotlist.com on the next
     * tick and retried each tick until it accepts them.
     */
    setPublicCommands(commands: unknown[]): void {
        this.pendingCommands = commands
    }

    private enabled(): Directory[] {
        return DIRECTORIES.filter(
            (d) => process.env[d.tokenEnv] && !this.disabled.has(d.name),
        )
    }

    protected onStart(): void {
        const active = this.enabled()
        if (active.length === 0) {
            if (!this.loggedMissingTokens) {
                infoLog({
                    message: `No bot directory tokens set (${DIRECTORIES.map((d) => d.tokenEnv).join(', ')}), directory stats posting disabled`,
                })
                this.loggedMissingTokens = true
            }
            return
        }
        infoLog({
            message: `Directory stats scheduler started for ${active.map((d) => d.name).join(', ')}`,
        })
        void this.tick()
    }

    protected async execute(): Promise<void> {
        const botId = this.client?.user?.id
        if (!this.client || !botId) return
        const guildCount = this.client.guilds.cache.size
        await Promise.all(
            this.enabled().map((d) => this.post(d, botId, guildCount)),
        )
        if (
            this.pendingCommands &&
            this.enabled().some((d) => d.name === DBL_NAME)
        ) {
            await this.postCommands(botId, this.pendingCommands)
        }
    }

    private async postCommands(
        botId: string,
        commands: unknown[],
    ): Promise<void> {
        try {
            const response = await this.fetchFn(DBL_COMMANDS_URL(botId), {
                method: 'POST',
                headers: {
                    Authorization: process.env.DISCORDBOTLIST_TOKEN as string,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(commands),
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            })
            if (response.ok) {
                this.pendingCommands = null
                this.failures.set(`${DBL_NAME} commands`, 0)
                infoLog({
                    message: `${DBL_NAME} commands posted successfully`,
                    data: { count: commands.length },
                })
                return
            }
            this.recordFailure(DBL_NAME, 'commands', `HTTP ${response.status}`)
        } catch (error) {
            this.recordFailure(DBL_NAME, 'commands', String(error))
        }
    }

    private async post(
        dir: Directory,
        botId: string,
        guildCount: number,
    ): Promise<void> {
        const token = process.env[dir.tokenEnv] as string
        try {
            const response = await this.fetchFn(dir.url(botId), {
                method: 'POST',
                headers: {
                    Authorization: token,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(dir.body(guildCount)),
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            })
            if (response.ok) {
                this.failures.set(`${dir.name} stats`, 0)
                infoLog({
                    message: `${dir.name} stats posted successfully`,
                    data: { guildCount },
                })
                return
            }
            if (REJECTED_STATUS.has(response.status)) {
                this.disabled.add(dir.name)
                warnLog({
                    message: `${dir.name} stats disabled: token rejected (HTTP ${response.status}). Rotate ${dir.tokenEnv} and restart the bot.`,
                })
                return
            }
            this.recordFailure(dir.name, 'stats', `HTTP ${response.status}`)
        } catch (error) {
            this.recordFailure(dir.name, 'stats', String(error))
        }
    }

    private recordFailure(
        directory: string,
        what: 'stats' | 'commands',
        reason: string,
    ): void {
        const key = `${directory} ${what}`
        const count = (this.failures.get(key) ?? 0) + 1
        this.failures.set(key, count)
        warnLog({ message: `${key} POST failed: ${reason}` })
        if (count === REPORT_AFTER_CONSECUTIVE_FAILURES) {
            captureMessage(
                `${key} POST failed ${count} times in a row: ${reason}`,
                'warning',
                { category: `directory.${what}`, directory },
            )
        }
    }
}

export const directoryStatsScheduler = new DirectoryStatsScheduler()
