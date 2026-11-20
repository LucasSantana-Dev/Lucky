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

/** Counter: "Play this week's mix" button clicks on the weekly recap card (#2739). */
export const recapMixPlayedTotal = new Counter({
    name: 'lucky_bot_recap_mix_played_total',
    help: "Count of times the Play this week's mix button was clicked on the weekly recap card.",
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
 * ytdlp_url|ytdlp_search|ytdlp_search_broad|soundcloud_full|soundcloud_title|soundcloud_core|bridge_total and `outcome` is ok|fail.
 * Bounded labels only: no guild, user, track or query values.
 */
export const playStageSeconds = new Histogram<'stage' | 'outcome'>({
    name: 'lucky_bot_play_stage_seconds',
    help: 'Duration in seconds of each /play stream bridge stage (ytdlp_url|ytdlp_search|ytdlp_search_broad|youtubei_native|soundcloud_full|soundcloud_title|soundcloud_core|bridge_total), by outcome (ok|fail).',
    labelNames: ['stage', 'outcome'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 8, 12, 20, 30],
    registers: [registry],
})

/**
 * Counter: plays whose bridge pass had already failed (bridge_total
 * outcome=fail) and that discord-player's fallback search hit then rescued
 * with a direct yt-dlp attempt. The failed-play alert subtracts it, so a
 * rescued play does not count as failed (#3079).
 */
export const playRescuedTotal = new Counter({
    name: 'lucky_bot_play_rescued_total',
    help: 'Plays rescued by the fallback search hit after the bridge pass had failed (offsets bridge_total outcome=fail).',
    registers: [registry],
})
playRescuedTotal.inc(0)

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
 * Synthetic play probe (#2920). `case` is one of the fixed probe cases
 * (youtube_watch|youtube_music|youtu_be|youtube_playlist|soundcloud_text),
 * `stage` is resolve|first_byte. Gauges, not counters: each run overwrites
 * the last result, and the probe never touches the play metrics above.
 */
export const playProbeSuccess = new Gauge<'case'>({
    name: 'lucky_bot_probe_success',
    help: 'Last synthetic play probe result per case: 1 resolved and streamed, 0 failed (#2920).',
    labelNames: ['case'],
    registers: [registry],
})

export const playProbeDurationSeconds = new Gauge<'case' | 'stage'>({
    name: 'lucky_bot_probe_duration_seconds',
    help: 'Duration in seconds of each stage in the last synthetic play probe run of a case (resolve|first_byte); first_byte is absent when that run failed at resolve.',
    labelNames: ['case', 'stage'],
    registers: [registry],
})

export const playProbeConsecutiveFailures = new Gauge<'case'>({
    name: 'lucky_bot_probe_consecutive_failures',
    help: 'Synthetic play probe runs in a row that failed, per case; 0 after a success (#2920).',
    labelNames: ['case'],
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
 * (forbidden|botcheck|empty|timeout|other|breaker_open). `breaker_open` counts a play that
 * exhausted every stage while the breaker was open. `forbidden` is YouTube's HTTP 403
 * on the media download and `botcheck` is its "not a bot" sign-in challenge;
 * both open the bridge's yt-dlp block breaker (#2653, #2744).
 * This is the counter the 2026-08-03 Lavalink re-evaluation ADR asked for.
 */
export const extractionFailuresTotal = new Counter<'type'>({
    name: 'lucky_bot_extraction_failures_total',
    help: 'yt-dlp stream extraction failures, by type (forbidden|botcheck|empty|timeout|other|breaker_open).',
    labelNames: ['type'],
    registers: [registry],
})
// Seed all types at 0 on boot so rate()/increase() queries (dashboards, future
// alert rules) have a baseline from the first scrape, even before the first
// failure (#2864).
for (const type of [
    'forbidden',
    'botcheck',
    'empty',
    'timeout',
    'other',
    'breaker_open',
]) {
    extractionFailuresTotal.labels(type).inc(0)
}

/**
 * Counter: interactions that expired before the bot acknowledged them
 * (Discord 10062), by command or button family (#3085).
 */
export const interactionExpiredTotal = new Counter<'source'>({
    name: 'lucky_bot_interaction_expired_total',
    help: 'Interactions that expired before the bot acknowledged them, by command or button.',
    labelNames: ['source'],
    registers: [registry],
})

/**
 * Counter: Spotify source cache lookups by result (hit|miss|negative).
 * `hit` — resolved YouTube URL served from cache (L1 or Redis).
 * `miss` — cache miss; yt-dlp search runs to resolve the source.
 * `negative` — cached failure entry; falls through to SoundCloud immediately.
 */
export const spotifyCacheTotal = new Counter<'result'>({
    name: 'lucky_bot_spotify_cache_total',
    help: 'Spotify source cache lookups, by result (hit|miss|negative).',
    labelNames: ['result'],
    registers: [registry],
})
// Export every result at 0 from boot so the first hit/miss/negative after each
// deploy has an increase().
for (const result of ['hit', 'miss', 'negative']) {
    spotifyCacheTotal.labels(result).inc(0)
}

/**
 * Counter: session snapshot restores on voice connect, by outcome. A restore
 * that brings tracks back replays the snapshot's current track from 0:00, so
 * a jump in `restored`/`late_restored` right after a deploy is the "song
 * repeated after restart" signal (#3151).
 * restored|empty: finished inside the 2s deadline with tracks|without.
 * late_restored|late_empty|late_failed: finished after the deadline.
 * failed: rejected inside the deadline.
 */
export const SESSION_RESTORE_OUTCOMES = [
    'restored',
    'empty',
    'late_restored',
    'late_empty',
    'late_failed',
    'failed',
] as const
export type SessionRestoreOutcome = (typeof SESSION_RESTORE_OUTCOMES)[number]

export const sessionRestoreTotal = new Counter<'outcome'>({
    name: 'lucky_bot_session_restore_total',
    help: 'Session snapshot restores on voice connect, by outcome (restored|empty|late_restored|late_empty|late_failed|failed).',
    labelNames: ['outcome'],
    registers: [registry],
})
for (const outcome of SESSION_RESTORE_OUTCOMES) {
    sessionRestoreTotal.labels(outcome).inc(0)
}

/**
 * Counter: tracks autoplay re-queued from the guild's own history because
 * every candidate collector came back empty. Each one is a song the guild
 * already heard, so any increase is a likely "bot repeats songs" report.
 */
export const autoplayHistoryReplayTracksTotal = new Counter({
    name: 'lucky_bot_autoplay_history_replay_tracks_total',
    help: 'Tracks autoplay re-queued from history because all candidate collectors were empty.',
    registers: [registry],
})
autoplayHistoryReplayTracksTotal.inc(0)

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
