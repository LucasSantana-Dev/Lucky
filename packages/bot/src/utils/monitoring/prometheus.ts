import {
    Registry,
    collectDefaultMetrics,
    Counter,
    Gauge,
    type CollectFunction,
} from 'prom-client'
import { getPrismaClient, errorLog } from '@lucky/shared/utils'

/**
 * Shared Prometheus registry for the bot. All metrics MUST be registered
 * against this registry so the /metrics endpoint produces a single
 * coherent scrape.
 */
export const registry = new Registry()

registry.setDefaultLabels({ service: 'lucky-bot' })
collectDefaultMetrics({ register: registry })

/**
 * Gauge: number of guilds the bot is currently in vs. has been removed
 * from, sourced from the `guilds` table via `joinedAt` / `leftAt`.
 * Updated lazily on each scrape via collect(); no in-memory drift.
 */
const guildsGaugeCollect: CollectFunction<Gauge<'state'>> =
    async function collectGuilds(this: Gauge<'state'>) {
        try {
            const prisma = getPrismaClient()
            const [active, left] = await Promise.all([
                prisma.guild.count({ where: { leftAt: null } }),
                prisma.guild.count({ where: { NOT: { leftAt: null } } }),
            ])
            this.set({ state: 'active' }, active)
            this.set({ state: 'left' }, left)
        } catch (error) {
            errorLog({
                message: 'prometheus: failed to collect lucky_bot_guilds_total',
                error,
            })
        }
    }

export const guildsGauge = new Gauge<'state'>({
    name: 'lucky_bot_guilds_total',
    help: 'Number of Discord guilds tracked, split by current bot membership state (active = bot is in the guild; left = bot was removed).',
    labelNames: ['state'],
    registers: [registry],
    collect: guildsGaugeCollect,
})

/**
 * Counter: Guild Automation usage from the Discord `/guildconfig` command,
 * labelled by operation type (plan|apply|reconcile). Mirrors the backend's
 * `lucky_guild_automation_usage_total` so the migration-freeze demand signal
 * captures BOTH surfaces (web/API + Discord command), not just the web. The
 * two counters are summed at decision time. Cardinality is bounded by the
 * operation label; guild id stays in logs, not labels.
 */
export const guildAutomationUsageTotal = new Counter<'operation'>({
    name: 'lucky_guild_automation_usage_total',
    help: 'Count of Guild Automation plan/apply/reconcile attempts via the Discord /guildconfig command, labelled by operation type.',
    labelNames: ['operation'],
    registers: [registry],
})

/**
 * Counter: Bot guild joins (GuildCreate events).
 * Incremented each time the bot is added to a guild.
 */
export const guildJoinsTotal = new Counter({
    name: 'lucky_bot_guild_joins_total',
    help: 'Total count of Discord guilds the bot has been added to.',
    registers: [registry],
})

/**
 * Counter: Bot guild leaves (GuildDelete events).
 * Incremented each time the bot is removed from a guild.
 */
export const guildLeavesTotal = new Counter({
    name: 'lucky_bot_guild_leaves_total',
    help: 'Total count of Discord guilds the bot has been removed from.',
    registers: [registry],
})

/**
 * Render the registry as Prometheus text exposition format.
 */
export async function renderMetrics(): Promise<string> {
    return registry.metrics()
}

/**
 * Content type for the /metrics endpoint response.
 */
export const metricsContentType: string = registry.contentType
