import type { CustomClient } from '../../types'
import {
    musicControlService,
    type MusicCommand,
    type MusicCommandResult,
} from '@lucky/shared/services'
import { buildQueueState } from './mappers'
import { resolveGuildQueue } from '../../utils/music/queueResolver'

type Result = MusicCommandResult

function fail(id: string, guildId: string, error: string): Result {
    return { id, guildId, success: false, error, timestamp: Date.now() }
}

function ok(
    id: string,
    guildId: string,
    data?: Record<string, unknown>,
): Result {
    return { id, guildId, success: true, data, timestamp: Date.now() }
}

export async function handleQueueMove(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = resolveGuildQueue(client, cmd.guildId).queue
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')

    const from = cmd.data?.from as number
    const to = cmd.data?.to as number
    const tracksArray = queue.tracks.toArray()

    if (
        from < 0 ||
        from >= tracksArray.length ||
        to < 0 ||
        to >= tracksArray.length
    ) {
        return fail(cmd.id, cmd.guildId, 'Invalid track positions')
    }

    const [moved] = tracksArray.splice(from, 1)
    tracksArray.splice(to, 0, moved)
    queue.tracks.clear()
    for (const track of tracksArray) queue.addTrack(track)

    const state = await buildQueueState(client, cmd.guildId)
    await musicControlService.publishState(state)
    return ok(cmd.id, cmd.guildId)
}

export async function handleQueueRemove(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = resolveGuildQueue(client, cmd.guildId).queue
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')

    const index = cmd.data?.index as number
    if (index < 0 || index >= queue.tracks.toArray().length) {
        return fail(cmd.id, cmd.guildId, 'Invalid track index')
    }

    queue.removeTrack(index)
    const state = await buildQueueState(client, cmd.guildId)
    await musicControlService.publishState(state)
    return ok(cmd.id, cmd.guildId)
}

export async function handleQueueClear(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = resolveGuildQueue(client, cmd.guildId).queue
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')

    queue.tracks.clear()
    const state = await buildQueueState(client, cmd.guildId)
    await musicControlService.publishState(state)
    return ok(cmd.id, cmd.guildId)
}

export async function handleImportPlaylist(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const url = cmd.data?.url as string
    if (!url) return fail(cmd.id, cmd.guildId, 'No URL provided')

    const queue = resolveGuildQueue(client, cmd.guildId).queue
    if (!queue)
        return fail(
            cmd.id,
            cmd.guildId,
            'No active queue. Start playing from Discord first.',
        )

    const result = await client.player.search(url, { requestedBy: undefined })
    if (!result?.tracks.length)
        return fail(cmd.id, cmd.guildId, 'No tracks found in playlist')

    for (const track of result.tracks) queue.addTrack(track)
    if (!queue.node.isPlaying() && !queue.node.isPaused())
        await queue.node.play()

    const state = await buildQueueState(client, cmd.guildId)
    await musicControlService.publishState(state)

    return ok(cmd.id, cmd.guildId, {
        tracksAdded: result.tracks.length,
        playlistName: result.playlist?.title ?? 'Unknown Playlist',
        source: detectSource(url),
    })
}

function detectSource(url: string): string {
    if (url.includes('spotify')) return 'spotify'
    if (url.includes('youtube') || url.includes('youtu.be')) return 'youtube'
    if (url.includes('deezer')) return 'deezer'
    return 'unknown'
}
