import type { Client } from 'discord.js'
import Parser from 'rss-parser'
import { debugLog, errorLog, infoLog } from '@lucky/shared/utils'
import { featureToggleService, getPrismaClient } from '@lucky/shared/services'

const RSS_FEED_URL = 'https://criativaria.com.br/rss.xml'
const POLL_INTERVAL_MS = 3600000 // 1 hour
const EMBED_COLOR = 0xe879a0

interface RssItem {
    title?: string
    link?: string
    description?: string
    content?: string
    pubDate?: string
}

let pollInterval: NodeJS.Timeout | null = null

export async function startRssBridgeService(client: Client): Promise<void> {
    const enabled = await featureToggleService.isEnabled('RSS_BRIDGE')
    if (!enabled) {
        return
    }

    const channelId = process.env.CRIATIVARIA_GUIDES_CHANNEL_ID
    if (!channelId) {
        errorLog({
            message:
                'RSS Bridge service requires CRIATIVARIA_GUIDES_CHANNEL_ID env variable',
        })
        return
    }

    try {
        infoLog({ message: 'RSS Bridge service started' })
        await pollRssFeed(client, channelId)
        // Schedule polling every hour
        pollInterval = setInterval(
            async () => {
                await pollRssFeed(client, channelId)
            },
            POLL_INTERVAL_MS,
        )
    } catch (err) {
        errorLog({
            message: 'RSS Bridge service failed to start (non-fatal)',
            data: err,
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

async function pollRssFeed(
    client: Client,
    channelId: string,
): Promise<void> {
    try {
        const parser = new Parser()
        const feed = await parser.parseURL(RSS_FEED_URL)

        if (!feed.items || feed.items.length === 0) {
            debugLog({
                message: 'No items found in RSS feed',
                data: { feedUrl: RSS_FEED_URL },
            })
            return
        }

        const db = getPrismaClient()
        const channel = await client.channels.fetch(channelId)

        if (!channel?.isTextBased()) {
            errorLog({
                message: 'RSS Bridge channel is not a text channel',
                data: { channelId },
            })
            return
        }

        for (const item of feed.items) {
            const itemTyped = item as RssItem
            const slug = extractSlug(itemTyped.link)

            if (!slug) {
                debugLog({
                    message: 'Could not extract slug from RSS item',
                    data: { link: itemTyped.link },
                })
                continue
            }

            // Check if we've already posted this guide
            const existing = await db.rssDiscoveredGuide.findUnique({
                where: { slug },
            })

            if (existing) {
                debugLog({
                    message: 'Guide already posted',
                    data: { slug },
                })
                continue
            }

            // Post new guide to Discord
            const title = itemTyped.title || 'Untitled'
            const description = truncateDescription(
                itemTyped.description || itemTyped.content || '',
            )

            try {
                await channel.send({
                    embeds: [
                        {
                            title,
                            description,
                            url: itemTyped.link,
                            color: EMBED_COLOR,
                        },
                    ],
                })

                // Record the guide in database
                await db.rssDiscoveredGuide.create({
                    data: {
                        slug,
                        title,
                    },
                })

                infoLog({
                    message: 'RSS guide posted',
                    data: { slug, title },
                })
            } catch (err) {
                errorLog({
                    message: 'Failed to post RSS guide',
                    error: err,
                    data: { slug, title },
                })
            }
        }
    } catch (err) {
        errorLog({
            message: 'Error polling RSS feed',
            error: err,
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
