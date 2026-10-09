import {
    Registry,
    collectDefaultMetrics,
    Counter,
    Gauge,
    Histogram,
    type CollectFunction,
} from 'prom-client'
import { getPrismaClient, errorLog } from '@lucky/shared/utils'
import { getStoredClient } from '../../bot/clientStore'

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
 * Rows with no `joinedAt` were created by the dashboard or integrations for
 * guilds the bot never joined, so they count as neither. Same definition as
 * the `analytics.guilds` view the business dashboard reads.
 * Updated lazily on each scrape via collect(); no in-memory drift.
 */
const guildsGaugeCollect: CollectFunction<Gauge<'state'>> =
    async function collectGuilds(this: Gauge<'state'>) {
        try {
            const prisma = getPrismaClient()
            const [active, left] = await Promise.all([
                prisma.guild.count({
                    where: { joinedAt: { not: null }, leftAt: null },
                }),
                prisma.guild.count({
                    where: { joinedAt: { not: null }, NOT: { leftAt: null } },
                }),
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
 * Gauge: whether the Discord gateway connection is currently ready
 * (client.isReady()). Distinct from process-liveness (`up`) — a zombie
 * process that finished init but later dropped its gateway connection
 * stays "up" while this goes to 0, which `up` alone cannot detect (#1651).
 */
const gatewayConnectedGaugeCollect: CollectFunction<Gauge> =
    function collectGatewayConnected(this: Gauge) {
        const client = getStoredClient()
        this.set(client?.isReady() ? 1 : 0)
    }

export const gatewayConnectedGauge = new Gauge({
    name: 'lucky_bot_gateway_connected',
    help: 'Whether the Discord gateway connection is currently ready (1) or not (0). Distinct from process-liveness: a zombie process that dropped its gateway after a successful init stays "up" but reports 0 here.',
    registers: [registry],
    collect: gatewayConnectedGaugeCollect,
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
 * Counter: weekly recaps where the image card path was abandoned and the text
 * embed was chosen instead (#2693). Counted when the fallback is chosen, not
 * when a post succeeds as text. reason: disabled|no_attach_permission|timeout|
 * http_error|bad_response|network.
 */
export const renderFallbackTotal = new Counter<'reason'>({
    name: 'lucky_bot_render_fallback_total',
    help: 'Count of weekly recaps where the lucky-render image card path was abandoned and the text embed chosen instead, labelled by reason.',
    labelNames: ['reason'],
    registers: [registry],
})
// Export every reason at 0 from boot: a series born at 1 has no increase(), so
// LuckyRecapCardAllFellBack would miss the first fallback after each deploy.
for (const reason of [
    'disabled',
    'no_attach_permission',
    'timeout',
    'http_error',
    'bad_response',
    'network',
]) {
    renderFallbackTotal.labels(reason).inc(0)
}

/** Counter: weekly recaps posted as the lucky-render image card (#2694). */
export const recapCardPostedTotal = new Counter({
    name: 'lucky_bot_recap_card_posted_total',
    help: 'Count of weekly recaps posted as the lucky-render image card.',
    registers: [registry],
})

/**
 * Counter: "did that autoplay song fit you?" prompts sent after a user skipped,
 * stopped or paused an autoplay track. Unlabelled: guild and user ids stay out
 * of labels.
 */
export const autoplayFeedbackPromptsTotal = new Counter({
    name: 'lucky_bot_autoplay_feedback_prompts_total',
    help: 'Count of autoplay feedback prompts sent after a skip, stop or pause of an autoplay track.',
    registers: [registry],
})
autoplayFeedbackPromptsTotal.inc(0)

/** Counter: answers to those prompts, labelled like|dislike. */
export const autoplayFeedbackAnswersTotal = new Counter<'feedback'>({
    name: 'lucky_bot_autoplay_feedback_answers_total',
    help: 'Count of stored answers to the autoplay feedback prompt, labelled by feedback (like|dislike).',
    labelNames: ['feedback'],
    registers: [registry],
})
// Zero from boot so the first answer after each deploy has an increase().
for (const feedback of ['like', 'dislike']) {
    autoplayFeedbackAnswersTotal.labels(feedback).inc(0)
}

/**
 * Counter: handled slash/context interactions (#2391). Cardinality is bounded:
 * `command` is a registered command name or "unknown", never raw user input.
 * Guild and user ids stay in command_events rows, not labels.
 */
export const commandsTotal = new Counter<'command' | 'kind' | 'outcome'>({
    name: 'lucky_bot_commands_total',
    help: 'Count of handled command interactions by command, kind (slash|context; component is deferred) and outcome (ok|user_error|error|denied).',
    labelNames: ['command', 'kind', 'outcome'],
    registers: [registry],
})

/** Histogram: command handling latency in seconds, labelled by command only. */
export const commandDurationSeconds = new Histogram<'command'>({
    name: 'lucky_bot_command_duration_seconds',
    help: 'Command handling duration in seconds, labelled by command.',
    labelNames: ['command'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    registers: [registry],
})

/**
 * Histogram: where /play spends its time, per stage. `stage` is one of
 * ytdlp_url|ytdlp_search|soundcloud_full|soundcloud_title|soundcloud_core|bridge_total and `outcome` is ok|fail.
 * Bounded labels only: no guild, user, track or query values.
 */
export const playStageSeconds = new Histogram<'stage' | 'outcome'>({
    name: 'lucky_bot_play_stage_seconds',
    help: 'Duration in seconds of each /play stream bridge stage (ytdlp_url|ytdlp_search|soundcloud_full|soundcloud_title|soundcloud_core|bridge_total), by outcome (ok|fail).',
    labelNames: ['stage', 'outcome'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 8, 12, 20, 30],
    registers: [registry],
})

/** Counter: command events lost before reaching the database (reason: overflow|flush_failure|stopped|internal_error). */
export const commandEventsDroppedTotal = new Counter<'reason'>({
    name: 'lucky_bot_command_events_dropped_total',
    help: 'Count of command events dropped before persisting, by reason (overflow|flush_failure|stopped|internal_error|stop_timeout).',
    labelNames: ['reason'],
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
 * Gauge: whether a music extractor is currently known-degraded (1) or
 * healthy (0), labelled by extractor name. Pushed directly by
 * `extractorHealth.ts` on registration success/failure — not lazily
 * collected, since registration is an event, not a queryable state.
 * Distinct from `lucky_bot_gateway_connected`: the gateway can be fully
 * connected while a specific extractor is unusable (#1929).
 */
export const musicExtractorDegradedGauge = new Gauge<'extractor'>({
    name: 'lucky_music_extractor_degraded',
    help: 'Whether a music extractor is currently known-degraded (1) or healthy (0), labelled by extractor name.',
    labelNames: ['extractor'],
    registers: [registry],
})

/**
 * Counter: yt-dlp stream extraction failures by type
 * (forbidden|botcheck|empty|timeout|other). `forbidden` is YouTube's HTTP 403
 * on the media download and `botcheck` is its "not a bot" sign-in challenge;
 * both open the bridge's yt-dlp block breaker (#2653, #2744).
 * This is the counter the 2026-08-03 Lavalink re-evaluation ADR asked for.
 */
export const extractionFailuresTotal = new Counter<'type'>({
    name: 'lucky_bot_extraction_failures_total',
    help: 'yt-dlp stream extraction failures, by type (forbidden|botcheck|empty|timeout|other).',
    labelNames: ['type'],
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
