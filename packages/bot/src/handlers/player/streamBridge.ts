import { spawn } from 'child_process'
import { PassThrough } from 'stream'
import type { Readable } from 'stream'
import type { Track } from 'discord-player'
import { errorLog, infoLog, warnLog, debugLog } from '@lucky/shared/utils'
import {
    cleanTitle,
    cleanAuthor,
    cleanSearchQuery,
} from '../../utils/music/searchQueryCleaner'
import { providerHealthService } from '../../utils/music/search/providerHealth'
import { streamViaSoundCloud } from './soundcloudMatcher'

const ALLOWED_YTDLP_DOMAINS = new Set([
    'youtube.com',
    'www.youtube.com',
    'youtu.be',
    'music.youtube.com',
    'soundcloud.com',
    'www.soundcloud.com',
])

function validateYtDlpUrl(url: string): void {
    if (url.startsWith('ytsearch')) return
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch (error) {
        throw new Error(`yt-dlp: invalid URL`, { cause: error })
    }
    if (parsed.protocol !== 'https:') {
        throw new Error(`yt-dlp: only https URLs are allowed`)
    }
    if (!ALLOWED_YTDLP_DOMAINS.has(parsed.hostname.toLowerCase())) {
        throw new Error(`yt-dlp: domain not in allowlist: ${parsed.hostname}`)
    }
}

export function streamViaYtDlp(url: string): Promise<Readable> {
    try {
        validateYtDlpUrl(url)
    } catch (err) {
        return Promise.reject(err)
    }
    return new Promise<Readable>((resolve, reject) => {
        const proc = spawn(
            // NOSONAR: S4036 — command is hardcoded, URL is validated by validateYtDlpUrl before this point
            'yt-dlp',
            [
                '--no-playlist',
                '-f',
                'bestaudio/best',
                '-o',
                '-',
                '--quiet',
                '--no-warnings',
                '--no-progress',
                '--js-runtimes',
                `node:${process.execPath}`,
                url,
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] },
        )

        const timeout = setTimeout(() => {
            proc.kill()
            reject(new Error('yt-dlp: timed out waiting for stream start'))
        }, 15_000)

        const stderrChunks: Buffer[] = []
        proc.stderr!.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

        let settled = false

        proc.stdout!.once('data', (firstChunk: Buffer) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            const through = new PassThrough()
            through.write(firstChunk)
            proc.stdout!.pipe(through)
            resolve(through)
        })

        proc.once('error', (err) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            proc.kill()
            reject(err)
        })

        proc.once('close', (code) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            if (code && code !== 0) {
                const stderr = Buffer.concat(stderrChunks).toString().trim()
                const reason = stderr ? ` — ${stderr.split('\n')[0]}` : ''
                reject(new Error(`yt-dlp exited with code ${code}${reason}`))
            }
        })
    })
}

export function streamViaYtDlpSearch(query: string): Promise<Readable> {
    if (!query.trim())
        return Promise.reject(new Error('yt-dlp search: empty query'))
    return streamViaYtDlp(`ytsearch1:${query}`)
}

export async function createResilientStream(
    track: Pick<Track, 'title' | 'author' | 'duration' | 'url'>,
    _ext?: unknown,
): Promise<Readable> {
    const cleanedTitle = cleanTitle(track.title)
    const cleanedAuthor = cleanAuthor(track.author)
    const isSpotifyUrl = track.url?.includes('open.spotify.com') ?? false

    debugLog({
        message: 'Bridge: resolving stream',
        data: {
            title: track.title,
            author: track.author,
            cleanedTitle,
            cleanedAuthor,
            hasUrl: Boolean(track.url),
            isSpotifyUrl,
        },
    })

    if (track.url && !isSpotifyUrl) {
        try {
            const stream = await streamViaYtDlp(track.url)
            infoLog({
                message: 'Bridge: streamed via yt-dlp',
                data: { url: track.url, title: cleanedTitle || track.title },
            })
            return stream
        } catch (ytdlpError) {
            warnLog({
                message: 'Bridge: yt-dlp failed, falling back to SoundCloud',
                data: {
                    error: (ytdlpError as Error).message,
                    url: track.url,
                    cleanedTitle,
                },
            })
        }
    }

    if (isSpotifyUrl) {
        const ytQuery = `${cleanSearchQuery(cleanedTitle, cleanedAuthor)} official audio`
        try {
            const stream = await streamViaYtDlpSearch(ytQuery)
            infoLog({
                message:
                    'Bridge: streamed via yt-dlp YouTube search (Spotify source)',
                data: { query: ytQuery, title: cleanedTitle },
            })
            return stream
        } catch (ytSearchError) {
            warnLog({
                message:
                    'Bridge: yt-dlp YouTube search failed, falling back to SoundCloud',
                data: {
                    error: (ytSearchError as Error).message,
                    query: ytQuery,
                    cleanedTitle,
                },
            })
        }
    }

    if (!cleanedTitle) {
        errorLog({
            message:
                'Bridge: yt-dlp failed and title is empty, cannot fallback',
            data: { url: track.url },
        })
        throw new Error('Bridge exhausted: no stream for empty title')
    }

    if (!providerHealthService.isAvailable('soundcloud')) {
        warnLog({
            message:
                'Bridge: SoundCloud circuit open, skipping fallback stages',
            data: {
                title: track.title,
                cleanedTitle,
                url: track.url,
            },
        })
        throw new Error(`Bridge exhausted: no stream for "${track.title}"`)
    }

    try {
        return await streamViaSoundCloud(
            cleanSearchQuery(cleanedTitle, cleanedAuthor),
            track.duration,
        )
    } catch (primaryError) {
        debugLog({
            message:
                'Bridge: SoundCloud primary search failed, retrying with title only',
            data: {
                error: (primaryError as Error).message,
                cleanedTitle,
            },
        })
    }

    try {
        return await streamViaSoundCloud(cleanedTitle, track.duration)
    } catch (titleOnlyError) {
        debugLog({
            message:
                'Bridge: title-only SoundCloud failed, retrying without parentheticals',
            data: {
                error: (titleOnlyError as Error).message,
                cleanedTitle,
            },
        })
    }

    const openParen = cleanedTitle.indexOf('(')
    const coreTitle =
        openParen > 0 ? cleanedTitle.slice(0, openParen).trim() : cleanedTitle
    if (coreTitle && coreTitle !== cleanedTitle) {
        try {
            return await streamViaSoundCloud(coreTitle, track.duration)
        } catch (coreError) {
            errorLog({
                message: 'Bridge: all stages exhausted',
                error: coreError,
                data: {
                    title: track.title,
                    cleanedTitle,
                    coreTitle,
                    url: track.url,
                    stages: [
                        'yt-dlp',
                        'soundcloud-full',
                        'soundcloud-title',
                        'soundcloud-core',
                    ],
                },
            })
        }
    } else {
        errorLog({
            message: 'Bridge: all stages exhausted',
            data: {
                title: track.title,
                cleanedTitle,
                url: track.url,
                stages: ['yt-dlp', 'soundcloud-full', 'soundcloud-title'],
            },
        })
    }

    throw new Error(`Bridge exhausted: no stream for "${track.title}"`)
}
