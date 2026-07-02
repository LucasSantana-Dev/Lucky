import type { Client } from 'discord.js'
import Parser from 'rss-parser'
import { debugLog, errorLog, infoLog } from '@lucky/shared/utils'
import { featureToggleService } from '@lucky/shared/services'
import { getPrismaClient } from '@lucky/shared/utils/database/prismaClient'

const POLL_INTERVAL_MS = 3600000 // 1 hour
const EMBED_COLOR = 0xe879a0

interface RssItem {
    title?: string
    link?: string
    description?: string
    content?: string
    pubDate?: string
    guid?: string
}

let pollInterval: ReturnType<typeof setInterval> | null = null

export async function startRssBridgeService(client: Client): Promise<void> {
    // Repeated starts must not stack polling intervals
    if (pollInterval) {
        return
    }
    const enabled = await featureToggleService.isEnabled('RSS_BRIDGE')
    if (!enabled) {
        return
    }

    try {
        const db = getPrismaClient()
        await ensureBackwardCompatibleSubscription(db)
        infoLog({ message: 'RSS Bridge service started' })
        await pollRssFeedSubscriptions(client)
        pollInterval = setInterval(async () => {
            await pollRssFeedSubscriptions(client)
        }, POLL_INTERVAL_MS)
    } catch (err) {
        errorLog({
            message: 'RSS Bridge service failed to start (non-fatal)',
            error: err,
        })
    }
}

export function stopRssBridgeService(): void {
    if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = null
        infoLog({ message: 'RSS Bridge service stopped' })
    }
}

async function ensureBackwardCompatibleSubscription(
    db: ReturnType<typeof getPrismaClient>,
): Promise<void> {
    const feedUrl =
        process.env.CRIATIVARIA_GUIDES_FEED_URL ||
        'https://criativaria.com.br/rss.xml'
    const channelId = process.env.CRIATIVARIA_GUIDES_CHANNEL_ID
    const guildId = process.env.CRIATIVARIA_GUILD_ID

    if (!channelId || !guildId) {
        debugLog({
            message: 'Backward compat RSS subscription: env not configured',
        })
        return
    }

    const existing = await db.rssFeedSubscription.findUnique({
        where: {
            guildId_feedUrl: {
                guildId,
                feedUrl,
            },
        },
    })

    if (!existing) {
        await db.rssFeedSubscription.create({
            data: {
                guildId,
                feedUrl,
                channelId,
                enabled: true,
            },
        })
        debugLog({
            message: 'Auto-seeded backward compatible RSS subscription',
            data: { guildId, feedUrl, channelId },
        })
    }
}

async function pollRssFeedSubscriptions(client: Client): Promise<void> {
    try {
        const db = getPrismaClient()
        const subscriptions = await db.rssFeedSubscription.findMany({
            where: { enabled: true },
        })

        if (subscriptions.length === 0) {
            debugLog({
                message: 'No RSS feed subscriptions to poll',
            })
            return
        }

        for (const subscription of subscriptions) {
            await pollSingleSubscription(client, db, subscription)
        }
    } catch (err) {
        errorLog({
            message: 'Error polling RSS feed subscriptions',
            error: err,
        })
    }
}

async function pollSingleSubscription(
    client: Client,
    db: ReturnType<typeof getPrismaClient>,
    subscription: {
        id: string
        guildId: string
        feedUrl: string
        channelId: string
        mentionRoleId: string | null
        lastItemGuid: string | null
        enabled: boolean
        createdAt: Date
        updatedAt: Date
    },
): Promise<void> {
    try {
        const parser = new Parser()
        const feed = await parser.parseURL(subscription.feedUrl)

        if (!feed.items || feed.items.length === 0) {
            debugLog({
                message: 'No items found in RSS feed',
                data: { feedUrl: subscription.feedUrl },
            })
            return
        }

        const channel = await client.channels.fetch(subscription.channelId)

        if (!channel?.isTextBased() || !('send' in channel)) {
            errorLog({
                message: 'RSS Bridge channel is not a text channel',
                data: {
                    channelId: subscription.channelId,
                    feedUrl: subscription.feedUrl,
                },
            })
            return
        }

        const sendableChannel = channel as unknown as {
            send: (options: unknown) => Promise<unknown>
        }

        const storedGuid = subscription.lastItemGuid
        let newestSeenGuid: string | null = null

        for (const item of feed.items) {
            const itemTyped = item as RssItem
            const itemGuid =
                itemTyped.guid || itemTyped.link || extractSlug(itemTyped.link)

            if (!itemGuid) {
                debugLog({
                    message: 'Could not extract GUID from RSS item',
                    data: { link: itemTyped.link },
                })
                continue
            }

            if (!newestSeenGuid) {
                // Feeds are newest-first: the first valid item anchors the cursor
                newestSeenGuid = itemGuid
            }

            if (storedGuid && itemGuid === storedGuid) {
                debugLog({
                    message: 'RSS item already posted',
                    data: { itemGuid },
                })
                break
            }

            const title = itemTyped.title || 'Untitled'
            const description = truncateDescription(
                itemTyped.description || itemTyped.content || '',
            )

            // Per-item dedup via RssDiscoveredGuide (the #1608 record other
            // consumers read) — lastItemGuid is only a fast-path short-circuit
            const rawSlug = extractSlug(itemTyped.link) || itemGuid
            // Scope dedup per guild so two guilds subscribing to the same
            // feed do not suppress each other; raw-slug lookup keeps the
            // pre-existing (Criativaria) rows honored without a repost burst
            const slug = `${subscription.guildId}:${rawSlug}`
            const existing =
                (await db.rssDiscoveredGuide.findUnique({
                    where: { slug },
                })) ??
                (await db.rssDiscoveredGuide.findUnique({
                    where: { slug: rawSlug },
                }))
            if (existing) {
                debugLog({
                    message: 'RSS item already posted',
                    data: { slug },
                })
                continue
            }

            try {
                const content = subscription.mentionRoleId
                    ? `<@&${subscription.mentionRoleId}>`
                    : undefined

                await sendableChannel.send({
                    content,
                    embeds: [
                        {
                            title,
                            description,
                            url: itemTyped.link,
                            color: EMBED_COLOR,
                        },
                    ],
                    allowedMentions: subscription.mentionRoleId
                        ? { roles: [subscription.mentionRoleId] }
                        : undefined,
                })

                await db.rssDiscoveredGuide.create({
                    data: { slug, title },
                })

                infoLog({
                    message: 'RSS item posted',
                    data: {
                        subscriptionId: subscription.id,
                        itemGuid,
                        title,
                    },
                })
            } catch (err) {
                errorLog({
                    message: 'Failed to post RSS item',
                    error: err,
                    data: {
                        subscriptionId: subscription.id,
                        itemGuid,
                        title,
                    },
                })
            }
        }

        if (newestSeenGuid && newestSeenGuid !== storedGuid) {
            await db.rssFeedSubscription.update({
                where: { id: subscription.id },
                data: { lastItemGuid: newestSeenGuid },
            })
        }
    } catch (err) {
        errorLog({
            message: 'Error polling RSS feed',
            error: err,
            data: {
                subscriptionId: subscription.id,
                feedUrl: subscription.feedUrl,
            },
        })
    }
}

function extractSlug(url?: string): string | null {
    if (!url) return null

    try {
        const urlObj = new URL(url)
        const pathname = urlObj.pathname
        const segments = pathname.split('/').filter((s) => s.length > 0)
        return segments[segments.length - 1] || null
    } catch {
        return null
    }
}

function truncateDescription(text: string): string {
    const maxLength = 150
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength - 1) + '…'
}
