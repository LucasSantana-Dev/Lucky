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
import { SUPPORT_SERVER_INVITE_URL } from '@lucky/shared/constants'
import { interactionReply } from '../utils/general/interactionReply'

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

export type FeedbackSubmissionContext = {
    commandName?: string
    sentryEventId?: string
}

type ModalSourceInteraction = ChatInputCommandInteraction | ButtonInteraction

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
        await interactionReply({
            interaction: modalSubmit,
            content: {
                content: t('feedback.errors.guildOnly'),
                ephemeral: true,
                allowedMentions: { parse: [] },
            },
        })
        return
    }

    const rateLimitKey = `feedback:${modalSubmit.user.id}`
    const rateLimitResult = await getFeedbackDatabaseService().checkRateLimit(
        rateLimitKey,
        FEEDBACK_RATE_LIMIT,
        FEEDBACK_RATE_LIMIT_WINDOW_MS,
    )
    // Fail-open: a rate-limit check that can't reach the database must never
    // block a real feedback submission (worse outcome than an occasional
    // over-limit send).
    if (rateLimitResult.isSuccess() && rateLimitResult.getData() === false) {
        await interactionReply({
            interaction: modalSubmit,
            content: {
                content: t('feedback.errors.rateLimited'),
                ephemeral: true,
                allowedMentions: { parse: [] },
            },
        })
        return
    }
    if (rateLimitResult.isFailure()) {
        errorLog({
            message: 'Feedback rate limit check failed; proceeding (fail-open)',
            error: rateLimitResult.getError(),
        })
    }

    const category = modalSubmit.fields.getStringSelectValues(
        FEEDBACK_CATEGORY_FIELD_ID,
    )[0] as FeedbackCategoryValue
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
    const text = expected
        ? `${whatHappened}\n\nExpected: ${expected}`
        : whatHappened

    const feedbackContext: Record<string, unknown> = {
        guildMemberCount: modalSubmit.guild?.memberCount,
        locale: modalSubmit.locale,
        ...(context.commandName ? { command: context.commandName } : {}),
        ...(context.sentryEventId
            ? { sentryEventId: context.sentryEventId }
            : {}),
    }

    const prisma = getPrismaClient()
    await prisma.userFeedback.create({
        data: {
            guildId,
            category,
            text,
            context: feedbackContext as unknown as Prisma.InputJsonValue,
        },
    })

    await postFeedbackToChannel(modalSubmit.client, {
        guildId,
        category,
        text,
        context: feedbackContext,
    })

    await interactionReply({
        interaction: modalSubmit,
        content: {
            content: t('feedback.thankYou', {
                url: SUPPORT_SERVER_INVITE_URL,
            }),
            ephemeral: true,
            allowedMentions: { parse: [] },
        },
    })
}
