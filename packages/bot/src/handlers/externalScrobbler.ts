import {
    Events,
    type Client,
    type Message,
    type VoiceChannel,
} from 'discord.js'
import { infoLog, errorLog, debugLog } from '@lucky/shared/utils'
import {
    isLastFmConfigured,
    getSessionKeyForUser,
    updateNowPlaying,
    scrobble,
} from '../lastfm'

const KNOWN_MUSIC_BOT_NAMES = ['rythm', 'groovy', 'fredboat', 'hydra', 'jockie']

const NOW_PLAYING_PATTERN = /^Now playing:\s+(.+?)\s+[–—-]\s+(.+)$/m

const lastExternalTrack = new Map<
    string,
    { title: string; artist: string; timestamp: number }
>()

function isMusicBot(message: Message): boolean {
    if (!message.author.bot) return false
    const name = message.author.username.toLowerCase()
    return KNOWN_MUSIC_BOT_NAMES.some((bot) => name.includes(bot))
}

function stripMarkdown(text: string): string {
    return text.replace(/[*_`~|]/g, '').trim()
}

function parseNowPlaying(
    content: string,
): { title: string; artist: string } | null {
    const clean = stripMarkdown(content)
    const match = clean.match(NOW_PLAYING_PATTERN)
    if (!match) return null
    return { title: match[1].trim(), artist: match[2].trim() }
}

function getMusicBotVoiceChannel(message: Message): VoiceChannel | null {
    const guild = message.guild
    if (!guild) return null
    const botMember = guild.members.cache.get(message.author.id)
    return (botMember?.voice.channel as VoiceChannel) ?? null
}

async function scrobblePreviousTrack(guildId: string): Promise<void> {
    const prev = lastExternalTrack.get(guildId)
    if (!prev) return
    lastExternalTrack.delete(guildId)

    const elapsed = Math.floor(Date.now() / 1000) - prev.timestamp
    if (elapsed < 30) return

    const guild = globalClient?.guilds.cache.get(guildId)
    if (!guild) return

    const voiceChannels = guild.channels.cache.filter(
        (ch) => ch.isVoiceBased() && ch.members.size > 0,
    )

    for (const [, channel] of voiceChannels) {
        if (!channel.isVoiceBased()) continue
        for (const [memberId, member] of channel.members) {
            if (member.user.bot) continue
            const sessionKey = await getSessionKeyForUser(memberId)
            if (!sessionKey) continue
            try {
                await scrobble(
                    prev.artist,
                    prev.title,
                    prev.timestamp,
                    elapsed,
                    sessionKey,
                )
                debugLog({
                    message: `Scrobbled (external): ${prev.artist} – ${prev.title} for ${member.user.username}`,
                })
            } catch (err) {
                errorLog({
                    message: 'External scrobble failed',
                    error: err,
                })
            }
        }
    }
}

let globalClient: Client | null = null

async function handleExternalNowPlaying(message: Message): Promise<void> {
    if (!isLastFmConfigured()) return
    if (!isMusicBot(message)) return

    const parsed = parseNowPlaying(message.content)
    if (!parsed) return

    const guildId = message.guild?.id
    if (!guildId) return

    infoLog({
        message: `External bot now playing: ${parsed.artist} – ${parsed.title}`,
    })

    await scrobblePreviousTrack(guildId)

    lastExternalTrack.set(guildId, {
        title: parsed.title,
        artist: parsed.artist,
        timestamp: Math.floor(Date.now() / 1000),
    })

    const voiceChannel = getMusicBotVoiceChannel(message)
    if (!voiceChannel) {
        debugLog({ message: 'Music bot not in a voice channel' })
        return
    }

    for (const [memberId, member] of voiceChannel.members) {
        if (member.user.bot) continue
        const sessionKey = await getSessionKeyForUser(memberId)
        if (!sessionKey) continue
        try {
            await updateNowPlaying(
                parsed.artist,
                parsed.title,
                undefined,
                sessionKey,
            )
            infoLog({
                message: `Last.fm now playing: ${parsed.artist} – ${parsed.title} for ${member.user.username}`,
            })
        } catch (err) {
            errorLog({
                message: 'External updateNowPlaying failed',
                error: err,
            })
        }
    }
}

export function handleExternalScrobbler(client: Client): void {
    globalClient = client
    client.on(Events.MessageCreate, async (message: Message) => {
        try {
            await handleExternalNowPlaying(message)
        } catch (error) {
            errorLog({
                message: 'Error in external scrobbler:',
                error,
            })
        }
    })
}
