import { QueryType } from 'discord-player'
import { warnLog } from '@lucky/shared/utils'
import type { CustomClient } from '../../types'
import {
    musicControlService,
    type MusicCommand,
    type MusicCommandResult,
} from '@lucky/shared/services'
import { buildQueueState, repeatModeToEnum } from './mappers'
import { resolveGuildQueue } from '../../services/musicManagement/queueResolver'
import { setReplenishSuppressed } from '../../services/musicManagement/replenishSuppressionStore'
import { TEXT_SEARCH_BLOCKED_EXTRACTORS } from '../../functions/music/commands/play/handlers/resolveProvider'
import { isUrl } from '../../functions/music/commands/play/queryUtils'
import { isHostedYoutubeEnabled } from '../../config/featureFlags'

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

// The dashboard searches with engine AUTO, so a plain text query lands on
// SpotifyExtractor first (its validate() claims any text). When Spotify comes
// back empty, discord-player does not try the next extractor, so retry the
// text query on YouTube (when hosted) and SoundCloud with the same block list
// as the /play fallback arms. URLs resolve to a known target and are not retried.
async function searchDashboardQuery(client: CustomClient, query: string) {
    const result = await client.player.search(query, { requestedBy: undefined })
    if (result?.tracks.length || isUrl(query)) return result

    const fallbackEngines = isHostedYoutubeEnabled()
        ? [QueryType.YOUTUBE_SEARCH, QueryType.SOUNDCLOUD_SEARCH]
        : [QueryType.SOUNDCLOUD_SEARCH]
    for (const searchEngine of fallbackEngines) {
        try {
            const fallback = await client.player.search(query, {
                requestedBy: undefined,
                searchEngine,
                blockExtractors: TEXT_SEARCH_BLOCKED_EXTRACTORS,
            })
            if (fallback?.tracks.length) return fallback
        } catch (error) {
            warnLog({
                message: 'Dashboard play fallback search failed',
                data: { query, searchEngine, error: String(error) },
            })
        }
    }
    return result
}

function getQueue(client: CustomClient, guildId: string) {
    return resolveGuildQueue(client, guildId).queue
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

    const result = await searchDashboardQuery(client, query)
    if (!result?.tracks.length)
        return fail(cmd.id, cmd.guildId, 'No results found')

    const queue = getQueue(client, cmd.guildId)
    if (!queue)
        return fail(
            cmd.id,
            cmd.guildId,
            'No active queue. Start playing from Discord first.',
        )

    setReplenishSuppressed(cmd.guildId, 0)
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
    await queue.node.skip()
    return publishAndOk(client, cmd)
}

export async function handleStop(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')
    queue.node.stop()
    queue.clear()
    queue.delete()
    setReplenishSuppressed(cmd.guildId, 30_000)
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

export async function handlePrevious(
    client: CustomClient,
    cmd: MusicCommand,
): Promise<Result> {
    const queue = getQueue(client, cmd.guildId)
    if (!queue) return fail(cmd.id, cmd.guildId, 'No active queue')

    // Per #1239: when no previous track, restart current track from beginning
    if (queue.history.isEmpty()) {
        const currentTrack = queue.currentTrack
        if (currentTrack) {
            await queue.node.seek(0)
        }
    } else {
        await queue.history.previous(true)
    }

    return publishAndOk(client, cmd)
}
