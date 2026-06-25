import {
    Events,
    ChannelType,
    type AnyThreadChannel,
    type Client,
} from 'discord.js'
import { getPrismaClient, errorLog, infoLog } from '@lucky/shared/utils'

// Extracts the canonical slug from an "official" forum thread marker.
// Format: <!-- official:v1:<slug> --> where slug matches web forum-content keys.
const OFFICIAL_MARKER_RE = /<!--\s*official:v1:([\w-]+)\s*-->/

export function extractOfficialSlug(content: string): string | null {
    const match = OFFICIAL_MARKER_RE.exec(content)
    return match?.[1] ?? null
}

export async function processForumThread(
    thread: AnyThreadChannel,
): Promise<void> {
    if (!thread.guildId || thread.parent?.type !== ChannelType.GuildForum)
        return

    let content: string
    try {
        const starter = await thread.fetchStarterMessage()
        if (!starter || starter.author.id !== thread.client.user?.id) return
        content = starter.content
    } catch {
        return
    }

    const slug = extractOfficialSlug(content)
    if (!slug) return

    const prisma = getPrismaClient()
    try {
        await prisma.guildForumThread.upsert({
            where: { guildId_slug: { guildId: thread.guildId, slug } },
            create: {
                guildId: thread.guildId,
                threadId: thread.id,
                slug,
                title: thread.name,
                archived: false,
            },
            update: {
                threadId: thread.id,
                title: thread.name,
                archived: false,
            },
        })
        infoLog({
            message: 'forum thread mapped',
            data: { guildId: thread.guildId, threadId: thread.id, slug },
        })
    } catch (error) {
        errorLog({
            message: 'failed to upsert forum thread mapping',
            data: { guildId: thread.guildId, threadId: thread.id, slug },
            error,
        })
    }
}

export function handleForumThreadCreate(client: Client): void {
    client.on(Events.ThreadCreate, (thread) => {
        processForumThread(thread).catch((error) => {
            errorLog({
                message: 'unhandled error in forumThreadHandler:',
                error,
            })
        })
    })
}
