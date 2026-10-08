import { randomUUID } from 'node:crypto'
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type ButtonInteraction,
    type ChatInputCommandInteraction,
    escapeMarkdown,
} from 'discord.js'
import { debugLog, errorLog } from '@lucky/shared/utils'
import { translatorForInteraction } from '../../i18n/translatorForInteraction'
import {
    autoplayFeedbackAnswersTotal,
    autoplayFeedbackPromptsTotal,
} from '../../utils/monitoring/prometheus'
import { recommendationFeedbackService } from './feedbackService'

/** customId: `autoplay_fb:<like|dislike>:<key>`. */
export const AUTOPLAY_FEEDBACK_BUTTON_PREFIX = 'autoplay_fb:'

const KEY_TTL_MS = 30 * 60 * 1000
const MAX_KEYS = 500
const PROMPT_COOLDOWN_MS = 10 * 60 * 1000
const MAX_COOLDOWNS = 2000
const TITLE_LIMIT = 80

type PromptInteraction = ChatInputCommandInteraction | ButtonInteraction

type PendingPrompt = {
    guildId: string
    userId: string
    trackKey: string
    title: string
    expiresAt: number
}

/** What was playing when the user acted; taken BEFORE the skip/stop/pause. */
export type AutoplayTrackSnapshot = {
    trackKey: string
    title: string
}

const pendingPrompts = new Map<string, PendingPrompt>()
const lastPromptAt = new Map<string, number>()

function evictOldest<V>(map: Map<string, V>, max: number): void {
    while (map.size > max) {
        const oldest = map.keys().next()
        if (oldest.done) return
        map.delete(oldest.value)
    }
}

function pruneExpired(now: number): void {
    for (const [key, entry] of pendingPrompts) {
        if (entry.expiresAt <= now) pendingPrompts.delete(key)
    }
    for (const [key, at] of lastPromptAt) {
        if (now - at >= PROMPT_COOLDOWN_MS) lastPromptAt.delete(key)
    }
}

/** Test helper: forget all in-memory state. */
export function resetAutoplayFeedbackPromptState(): void {
    pendingPrompts.clear()
    lastPromptAt.clear()
}

/**
 * Snapshot of `track` when it came from autoplay (metadata.isAutoplay, set by
 * markAsAutoplayTrack on every autoplay pick), otherwise null. Never throws.
 */
export function captureAutoplayTrack(
    track:
        | { title?: string; author?: string; metadata?: unknown }
        | null
        | undefined,
): AutoplayTrackSnapshot | null {
    try {
        if (!track) return null
        const metadata = track.metadata as { isAutoplay?: boolean } | undefined
        if (metadata?.isAutoplay !== true) return null
        const title = track.title ?? ''
        const trackKey = recommendationFeedbackService.buildTrackKey(
            title,
            track.author ?? '',
        )
        // Same guard as the thumbs button: "::" is every unnamed track at once.
        if (trackKey === '::') return null
        return { trackKey, title }
    } catch {
        return null
    }
}

async function alreadyVoted(
    guildId: string,
    userId: string,
    trackKey: string,
): Promise<boolean> {
    const [liked, disliked] = await Promise.all([
        recommendationFeedbackService.getLikedTrackKeys(guildId, userId),
        recommendationFeedbackService.getDislikedTrackKeys(guildId, userId),
    ])
    return liked.has(trackKey) || disliked.has(trackKey)
}

/**
 * Asks the actor, ephemerally, whether the autoplay track they just skipped,
 * stopped or paused fit them. Best effort: any failure is logged and swallowed
 * so it can never break the command or button that triggered it.
 */
export async function maybePromptAutoplayFeedback(
    interaction: PromptInteraction,
    snapshot: AutoplayTrackSnapshot | null,
): Promise<void> {
    try {
        const guildId = interaction.guildId
        if (!snapshot || !guildId) return
        const userId = interaction.user.id
        const coolKey = `${guildId}:${userId}`

        const coolingDown = (now: number): boolean =>
            now - (lastPromptAt.get(coolKey) ?? Number.NEGATIVE_INFINITY) <
            PROMPT_COOLDOWN_MS
        if (coolingDown(Date.now())) return

        if (await alreadyVoted(guildId, userId, snapshot.trackKey)) return

        // Re-check and claim with no await in between: two quick actions must
        // not both pass the cooldown above.
        const now = Date.now()
        if (coolingDown(now)) return
        pruneExpired(now)
        lastPromptAt.set(coolKey, now)
        evictOldest(lastPromptAt, MAX_COOLDOWNS)

        const key = randomUUID().slice(0, 8)
        pendingPrompts.set(key, {
            guildId,
            userId,
            trackKey: snapshot.trackKey,
            title: snapshot.title,
            expiresAt: now + KEY_TTL_MS,
        })
        evictOldest(pendingPrompts, MAX_KEYS)

        const t = await translatorForInteraction(interaction)
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`${AUTOPLAY_FEEDBACK_BUTTON_PREFIX}like:${key}`)
                .setEmoji('👍')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`${AUTOPLAY_FEEDBACK_BUTTON_PREFIX}dislike:${key}`)
                .setEmoji('👎')
                .setStyle(ButtonStyle.Secondary),
        )
        await interaction.followUp({
            content: t('music.autoplayFeedback.prompt'),
            components: [row],
            ephemeral: true,
            allowedMentions: { parse: [] },
        })
        autoplayFeedbackPromptsTotal.inc()
    } catch (error) {
        errorLog({
            message: 'Autoplay feedback prompt failed',
            error,
            data: { guildId: interaction.guildId },
        })
    }
}

/**
 * Click on a prompt's thumbs. Targets the track that was skipped (captured
 * when the prompt was sent), not whatever plays now. Only the user the prompt
 * was sent to can answer.
 */
export async function handleAutoplayFeedbackButton(
    interaction: ButtonInteraction,
): Promise<void> {
    try {
        const t = await translatorForInteraction(interaction)
        const reply = (content: string) =>
            interaction.reply({
                content,
                ephemeral: true,
                allowedMentions: { parse: [] },
            })

        const [feedback, key] = interaction.customId
            .slice(AUTOPLAY_FEEDBACK_BUTTON_PREFIX.length)
            .split(':')
        if ((feedback !== 'like' && feedback !== 'dislike') || !key) {
            await reply(t('music.autoplayFeedback.expired'))
            return
        }

        const pending = pendingPrompts.get(key)
        if (!pending || pending.expiresAt <= Date.now()) {
            pendingPrompts.delete(key)
            await reply(t('music.autoplayFeedback.expired'))
            return
        }
        if (pending.userId !== interaction.user.id) {
            await reply(t('music.autoplayFeedback.notForYou'))
            return
        }

        const saved = await recommendationFeedbackService.setFeedback(
            pending.guildId,
            interaction.user.id,
            interaction.user.username,
            pending.trackKey,
            feedback,
        )
        if (!saved) {
            await reply(t('music.autoplayFeedback.failed'))
            return
        }

        pendingPrompts.delete(key)
        autoplayFeedbackAnswersTotal.labels(feedback).inc()
        debugLog({
            message: 'Autoplay feedback stored',
            data: { guildId: pending.guildId, feedback },
        })
        // Track metadata is untrusted: keep it from breaking the markdown.
        const title = escapeMarkdown(
            pending.title.length > TITLE_LIMIT
                ? `${pending.title.slice(0, TITLE_LIMIT - 1)}…`
                : pending.title,
        )
        await interaction.update({
            content: t(
                feedback === 'like'
                    ? 'music.autoplayFeedback.liked'
                    : 'music.autoplayFeedback.disliked',
                { title },
            ),
            components: [],
            allowedMentions: { parse: [] },
        })
    } catch (error) {
        errorLog({
            message: 'Autoplay feedback button error',
            error,
            data: { guildId: interaction.guildId },
        })
    }
}
