import type { CustomClient } from '../../types'
import {
    musicControlService,
    type MusicCommand,
    type MusicCommandResult,
} from '@lucky/shared/services'
import { buildQueueState, repeatModeToEnum } from './mappers'

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

async function publishAndOk(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const state = await buildQueueState(client, cmd.guildId)
    await musicControlService.publishState(state)
    return ok(cmd.id, cmd.guildId)
}

function getQueue(client: CustomClient, guildId: string) {
    return client.player.queues.get(guildId)
}

export async function handleGetState(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const state = await buildQueueState(client, cmd.guildId)
    await musicControlService.publishState(state)
    return ok(cmd.id, cmd.guildId)
}

export async function handlePlay(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const query = cmd.data?.query as string
    if (!query) return fail(cmd.id, cmd.guildId, 'No query provided')

    const guild = client.guilds.cache.get(cmd.guildId)
    if (!guild) return fail(cmd.id, cmd.guildId, 'Guild not found')

    const voiceChannelId = cmd.data?.voiceChannelId as string | undefined
    if (voiceChannelId && !guild.channels.cache.get(voiceChannelId)) {
        return fail(cmd.id, cmd.guildId, 'Voice channel not found')
    }

    const result = await client.player.search(query, { requestedBy: undefined })
    if (!result?.tracks.length)
        return fail(cmd.id, cmd.guildId, 'No results found')

    const queue = getQueue(client, cmd.guildId)
    if (!queue)
        return fail(
            cmd.id,
            cmd.guildId,
            'No active queue. Start playing from Discord first.',
        )

    if (result.playlist) {
        for (const track of result.tracks) queue.addTrack(track)
    } else {
        queue.addTrack(result.tracks[0])
    }

    if (!queue.node.isPlaying() && !queue.node.isPaused())
        await queue.node.play()

    const state = await buildQueueState(client, cmd.guildId)
    await musicControlService.publishState(state)
    return ok(cmd.id, cmd.guildId, {
        tracksAdded: result.playlist ? result.tracks.length : 1,
        isPlaylist: !!result.playlist,
        title: result.playlist?.title ?? result.tracks[0].title,
    })
}

export async function handlePause(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')
    queue.node.pause()
    return publishAndOk(client, cmd)
}

export async function handleResume(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')
    queue.node.resume()
    return publishAndOk(client, cmd)
}

export async function handleSkip(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')
    queue.node.skip()
    setTimeout(async () => {
        const state = await buildQueueState(client, cmd.guildId)
        await musicControlService.publishState(state)
    }, 500)
    return ok(cmd.id, cmd.guildId)
}

export async function handleStop(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')
    queue.node.stop()
    queue.delete()
    return publishAndOk(client, cmd)
}

export async function handleVolume(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')
    queue.node.setVolume(cmd.data?.volume as number)
    return publishAndOk(client, cmd)
}

export async function handleShuffle(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')
    queue.tracks.shuffle()
    return publishAndOk(client, cmd)
}

export async function handleRepeat(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')
    queue.setRepeatMode(repeatModeToEnum(cmd.data?.mode as string))
    return publishAndOk(client, cmd)
}

export async function handleSeek(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')
    await queue.node.seek(cmd.data?.position as number)
    return publishAndOk(client, cmd)
}
