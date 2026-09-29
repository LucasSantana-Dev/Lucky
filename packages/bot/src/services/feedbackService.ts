import {
    ModalBuilder,
    LabelBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    type ChatInputCommandInteraction,
    type ButtonInteraction,
    type ModalSubmitInteraction,
} from 'discord.js'
import type { TFunction } from 'i18next'
import {
    getPrismaClient,
    createEmbed,
    warnLog,
    errorLog,
    EMBED_COLORS,
} from '@lucky/shared/utils'
import type { Prisma } from '@lucky/shared/utils'
import { DatabaseService } from '@lucky/shared/services'
import {
    SUPPORT_SERVER_INVITE_URL,
    DEFAULT_BOT_LANGUAGE,
} from '@lucky/shared/constants'
import { interactionReply } from '../utils/general/interactionReply'
import { translatorForInteraction } from '../i18n/translatorForInteraction'
import { translatorFor } from '../i18n'

// Two entry points (`/feedback`, and the "Report this" button on a command
// error — see commandsHandler.ts) funnel into this one module (#2477).

export const FEEDBACK_TEXT_MAX_LENGTH = 1000
export const FEEDBACK_RATE_LIMIT = 3
export const FEEDBACK_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

const FEEDBACK_WHAT_HAPPENED_FIELD_ID = 'feedback_what_happened'
const FEEDBACK_EXPECTED_FIELD_ID = 'feedback_expected'
const FEEDBACK_CATEGORY_FIELD_ID = 'feedback_category'

/** Prefix for the "Report this" button's custom id. Parsed by
 * feedbackButtonHandler.ts; built by commandsHandler.ts's error reply. */
export const FEEDBACK_REPORT_BUTTON_PREFIX = 'feedback_report:'

// Lazy singleton, not a module-scope instantiation: buildFeedbackReportCustomId
// (a pure function) is imported by commandsHandler.ts just to build the
// "Report this" button, and that import must not have the side effect of
// constructing a DatabaseService. DatabaseConfig is accepted by the
// constructor but not read by DatabaseService today (it talks to the shared
// getPrismaClient() singleton regardless of these values); kept only to
// satisfy the required shape. Same boilerplate as dataRetentionScheduler.ts.
let databaseServiceInstance: DatabaseService | null = null
function getFeedbackDatabaseService(): DatabaseService {
    if (!databaseServiceInstance) {
        databaseServiceInstance = new DatabaseService({
            url: process.env.DATABASE_URL ?? '',
            ttl: 3600,
            maxConnections: 10,
            connectionTimeout: 5000,
        })
    }
    return databaseServiceInstance
}

export type FeedbackCategoryValue = 'bug' | 'idea' | 'other'
const FEEDBACK_CATEGORY_VALUES: readonly FeedbackCategoryValue[] = [
    'bug',
    'idea',
    'other',
]
function isFeedbackCategoryValue(
    value: string | undefined,
): value is FeedbackCategoryValue {
    return (FEEDBACK_CATEGORY_VALUES as readonly string[]).includes(value ?? '')
}

export type FeedbackSubmissionContext = {
    commandName?: string
    sentryEventId?: string
}

type ModalSourceInteraction = ChatInputCommandInteraction | ButtonInteraction

const TRANSLATOR_RESOLUTION_DEADLINE_MS = 1500

/**
 * Resolves the interaction's translator with a hard deadline, falling back to
 * the bot's default-language translator if resolution doesn't finish in time.
 * `translatorForInteraction` is cached per guild but occasionally does a real
 * database read on a cold cache; both /feedback and the "Report this" button
 * must call `showModal()` inside Discord's ~3s interaction-ack window, so a
 * slow lookup here must never eat into that budget (#2477 review).
 */
export async function resolveFeedbackTranslator(
    interaction: Parameters<typeof translatorForInteraction>[0],
): Promise<TFunction> {
    const timeout = new Promise<TFunction>((resolve) => {
        setTimeout(
            () => resolve(translatorFor(DEFAULT_BOT_LANGUAGE)),
            TRANSLATOR_RESOLUTION_DEADLINE_MS,
        )
    })
    return Promise.race([translatorForInteraction(interaction), timeout])
}

/** Builds the `feedback_report:<commandName>:<sentryEventId>` custom id for the
 * "Report this" button. `sentryEventId` is omitted (empty segment) when Sentry
 * is disabled or capture failed. */
export function buildFeedbackReportCustomId(
    commandName: string,
    sentryEventId?: string,
): string {
    return `${FEEDBACK_REPORT_BUTTON_PREFIX}${commandName}:${sentryEventId ?? ''}`
}

/** Parses a `feedback_report:` custom id back into its command name and
 * (optional) Sentry event id. Returns `null` for a malformed id. */
export function parseFeedbackReportCustomId(
    customId: string,
): { commandName: string; sentryEventId?: string } | null {
    if (!customId.startsWith(FEEDBACK_REPORT_BUTTON_PREFIX)) return null
    const rest = customId.slice(FEEDBACK_REPORT_BUTTON_PREFIX.length)
    const [commandName, sentryEventId] = rest.split(':')
    if (!commandName) return null
    return {
        commandName,
        sentryEventId: sentryEventId ? sentryEventId : undefined,
    }
}

/** Builds the `/feedback` modal: a required "what happened" paragraph, an
 * optional "what did you expect" paragraph, and a bug/idea/other category
 * select. Category is a real select menu (not a text field) via LabelBuilder
 * — discord.js 14.27 / @discordjs/builders support a StringSelectMenuBuilder
 * wrapped in a LabelBuilder inside a modal (ModalSubmitFields.getStringSelectValues). */
export function buildFeedbackModal(
    customId: string,
    t: TFunction,
): ModalBuilder {
    return new ModalBuilder()
        .setCustomId(customId)
        .setTitle(t('feedback.modal.title'))
        .addLabelComponents(
            new LabelBuilder()
                .setLabel(t('feedback.modal.whatHappenedLabel'))
                .setTextInputComponent(
                    new TextInputBuilder()
                        .setCustomId(FEEDBACK_WHAT_HAPPENED_FIELD_ID)
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setMaxLength(FEEDBACK_TEXT_MAX_LENGTH),
                ),
            new LabelBuilder()
                .setLabel(t('feedback.modal.expectedLabel'))
                .setTextInputComponent(
                    new TextInputBuilder()
                        .setCustomId(FEEDBACK_EXPECTED_FIELD_ID)
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(false)
                        .setMaxLength(FEEDBACK_TEXT_MAX_LENGTH),
                ),
            new LabelBuilder()
                .setLabel(t('feedback.modal.categoryLabel'))
                .setStringSelectMenuComponent(
                    new StringSelectMenuBuilder()
                        .setCustomId(FEEDBACK_CATEGORY_FIELD_ID)
                        .addOptions(
                            {
                                label: t('feedback.categories.bug'),
                                value: 'bug',
                            },
                            {
                                label: t('feedback.categories.idea'),
                                value: 'idea',
                            },
                            {
                                label: t('feedback.categories.other'),
                                value: 'other',
                            },
                        ),
                ),
        )
}

/** Shows the feedback modal on `source` (a slash command or a button
 * interaction — both support showModal/awaitModalSubmit) and waits for the
 * user to submit it. Returns `null` on timeout/dismissal, matching the
 * existing `vaga.ts` collectDescricao pattern. */
export async function openFeedbackModalAndAwaitSubmit(
    source: ModalSourceInteraction,
    t: TFunction,
): Promise<ModalSubmitInteraction | null> {
    // Scoped to this invocation's own interaction id, same reasoning as
    // vaga.ts: without it, two concurrent /feedback (or report-button) uses by
    // the same user could resolve the wrong awaitModalSubmit.
    const customId = `feedback_modal_${source.id}`
    await source.showModal(buildFeedbackModal(customId, t))
    try {
        return await source.awaitModalSubmit({
            filter: (i) =>
                i.user.id === source.user.id && i.customId === customId,
            time: 5 * 60 * 1000,
        })
    } catch {
        return null
    }
}

type FeedbackChannelPayload = {
    guildId: string
    category: FeedbackCategoryValue
    text: string
    context: Record<string, unknown>
}

/** Posts the feedback embed to FEEDBACK_CHANNEL_ID. No-ops with a warning log
 * when the env var is unset (#2477 acceptance) or the channel can't be
 * reached — a delivery failure here must never block persistence or the
 * user-facing thank-you reply. */
async function postFeedbackToChannel(
    client: ModalSubmitInteraction['client'],
    payload: FeedbackChannelPayload,
): Promise<void> {
    const channelId = process.env.FEEDBACK_CHANNEL_ID
    if (!channelId) {
        warnLog({
            message:
                'FEEDBACK_CHANNEL_ID not configured; skipping feedback channel post',
        })
        return
    }

    try {
        const channel = await client.channels.fetch(channelId).catch(() => null)
        if (!channel || !channel.isSendable()) {
            warnLog({
                message: 'Feedback channel unavailable',
                data: { channelId },
            })
            return
        }

        const fields = [
            { name: 'Guild', value: payload.guildId, inline: true },
            {
                name: 'Members',
                value: String(payload.context.guildMemberCount ?? 'unknown'),
                inline: true,
            },
            {
                name: 'Locale',
                value: String(payload.context.locale ?? 'unknown'),
                inline: true,
            },
            ...(payload.context.command
                ? [
                      {
                          name: 'Command',
                          value: String(payload.context.command),
                          inline: true,
                      },
                  ]
                : []),
            ...(payload.context.sentryEventId
                ? [
                      {
                          name: 'Sentry',
                          value: String(payload.context.sentryEventId),
                          inline: true,
                      },
                  ]
                : []),
            { name: 'Feedback', value: payload.text.slice(0, 1024) },
        ]

        const embed = createEmbed({
            title: `New ${payload.category} report`,
            fields,
            color: EMBED_COLORS.INFO,
            timestamp: true,
        })

        await channel.send({
            embeds: [embed],
            allowedMentions: { parse: [] },
        })
    } catch (error) {
        warnLog({ message: 'Failed to post feedback to channel', error })
    }
}

/** Every user-facing reply from this pipeline is ephemeral with mentions
 * suppressed — factored out so submitFeedback reads as named pipeline steps
 * instead of five near-identical interactionReply blocks. */
async function replyEphemeral(
    modalSubmit: ModalSubmitInteraction,
    content: string,
): Promise<void> {
    await interactionReply({
        interaction: modalSubmit,
        content: { content, ephemeral: true, allowedMentions: { parse: [] } },
    })
}

/** 3/hour/user, fail-open on a database error (a rate-limit check that can't
 * reach the database must never block a real submission). */
async function isWithinFeedbackRateLimit(userId: string): Promise<boolean> {
    const result = await getFeedbackDatabaseService().checkRateLimit(
        `feedback:${userId}`,
        FEEDBACK_RATE_LIMIT,
        FEEDBACK_RATE_LIMIT_WINDOW_MS,
    )
    if (result.isFailure()) {
        errorLog({
            message: 'Feedback rate limit check failed; proceeding (fail-open)',
            error: result.getError(),
        })
        return true
    }
    return result.getData() !== false
}

type ParsedFeedbackFields = {
    category: FeedbackCategoryValue
    text: string
}

/** Parses and validates the modal's fields. Returns `null` when the category
 * is outside bug/idea/other — a forged/replayed interaction is not bound by
 * the modal's own select options (#2477 review). */
function extractFeedbackFields(
    modalSubmit: ModalSubmitInteraction,
): ParsedFeedbackFields | null {
    const rawCategory = modalSubmit.fields.getStringSelectValues(
        FEEDBACK_CATEGORY_FIELD_ID,
    )[0]
    if (!isFeedbackCategoryValue(rawCategory)) return null

    const whatHappened = modalSubmit.fields.getTextInputValue(
        FEEDBACK_WHAT_HAPPENED_FIELD_ID,
    )
    let expected: string
    try {
        expected = modalSubmit.fields.getTextInputValue(
            FEEDBACK_EXPECTED_FIELD_ID,
        )
    } catch {
        expected = ''
    }

    return {
        category: rawCategory,
        text: expected
            ? `${whatHappened}\n\nExpected: ${expected}`
            : whatHappened,
    }
}

function buildFeedbackContext(
    modalSubmit: ModalSubmitInteraction,
    context: FeedbackSubmissionContext,
): Record<string, unknown> {
    return {
        guildMemberCount: modalSubmit.guild?.memberCount,
        locale: modalSubmit.locale,
        ...(context.commandName ? { command: context.commandName } : {}),
        ...(context.sentryEventId
            ? { sentryEventId: context.sentryEventId }
            : {}),
    }
}

/** The two delivery side effects: the durable row, then the (best-effort)
 * channel post. */
async function persistFeedback(
    modalSubmit: ModalSubmitInteraction,
    guildId: string,
    fields: ParsedFeedbackFields,
    feedbackContext: Record<string, unknown>,
): Promise<void> {
    const prisma = getPrismaClient()
    await prisma.userFeedback.create({
        data: {
            guildId,
            category: fields.category,
            text: fields.text,
            context: feedbackContext as unknown as Prisma.InputJsonValue,
        },
    })

    await postFeedbackToChannel(modalSubmit.client, {
        guildId,
        category: fields.category,
        text: fields.text,
        context: feedbackContext,
    })
}

/** Core submission path shared by both entry points: rate limit, persist,
 * deliver to the feedback channel, reply with thanks + the support invite.
 * Never stores a user id (#2477 acceptance) — nothing but guildId, category,
 * text, and the context payload reaches the database or the channel embed. */
export async function submitFeedback(
    modalSubmit: ModalSubmitInteraction,
    context: FeedbackSubmissionContext,
    t: TFunction,
): Promise<void> {
    const guildId = modalSubmit.guildId
    if (!guildId) {
        await replyEphemeral(modalSubmit, t('feedback.errors.guildOnly'))
        return
    }

    if (!(await isWithinFeedbackRateLimit(modalSubmit.user.id))) {
        await replyEphemeral(modalSubmit, t('feedback.errors.rateLimited'))
        return
    }

    const fields = extractFeedbackFields(modalSubmit)
    if (!fields) {
        await replyEphemeral(modalSubmit, t('feedback.errors.invalidCategory'))
        return
    }

    const feedbackContext = buildFeedbackContext(modalSubmit, context)
    await persistFeedback(modalSubmit, guildId, fields, feedbackContext)

    await replyEphemeral(
        modalSubmit,
        t('feedback.thankYou', { url: SUPPORT_SERVER_INVITE_URL }),
    )
}
