import WebSocket from 'ws'
import type { Client } from 'discord.js'
import { errorLog, infoLog, debugLog, warnLog } from '@lucky/shared/utils'
import { getTwitchUserAccessToken } from './token'
import {
    type NotificationPayload,
    type StreamOfflinePayload,
    type ChannelUpdatePayload,
    type ChannelRaidPayload,
    subscribeToStreamOnline,
    handleStreamOnline,
    subscribeToStreamOffline,
    handleStreamOffline,
    subscribeToChannelUpdate,
    handleChannelUpdate,
    subscribeToChannelRaid,
    handleChannelRaid,
} from './eventsubSubscriptions'

const EVENTSUB_HOST = 'eventsub.wss.twitch.tv'
const EVENTSUB_WS_URL = `wss://${EVENTSUB_HOST}/ws`
const STREAM_ONLINE_TYPE = 'stream.online'
const STREAM_OFFLINE_TYPE = 'stream.offline'
const CHANNEL_UPDATE_TYPE = 'channel.update'
const CHANNEL_RAID_TYPE = 'channel.raid'

const EVENT_LABELS = [
    STREAM_ONLINE_TYPE,
    STREAM_OFFLINE_TYPE,
    CHANNEL_UPDATE_TYPE,
    CHANNEL_RAID_TYPE,
] as const

type WelcomePayload = {
    session: {
        id: string
        status: string
        keepalive_timeout_seconds: number
        reconnect_url: string | null
    }
}
type ReconnectPayload = { session: { reconnect_url: string } }
type Message = {
    metadata: { message_type: string }
    payload: WelcomePayload | NotificationPayload | ReconnectPayload
}

export class TwitchEventSubClient {
    private ws: WebSocket | null = null
    private client: Client | null = null
    private sessionId: string | null = null
    private reconnectUrl: string | null = null
    private clientId: string = ''
    private keepaliveTimeout: ReturnType<typeof setTimeout> | null = null
    private subscribedUserIds: Set<string> = new Set()
    private subscribedOfflineIds: Set<string> = new Set()
    private subscribedUpdateIds: Set<string> = new Set()
    private subscribedRaidIds: Set<string> = new Set()

    async start(discordClient: Client): Promise<void> {
        this.clientId = process.env.TWITCH_CLIENT_ID ?? ''
        if (!this.clientId) {
            infoLog({
                message: 'Twitch EventSub: TWITCH_CLIENT_ID not set, skipping',
            })
            return
        }
        const token = await getTwitchUserAccessToken()
        if (!token) {
            infoLog({
                message:
                    'Twitch EventSub: user access token not available, skipping',
            })
            return
        }
        this.client = discordClient
        await this.connect(EVENTSUB_WS_URL)
    }

    // Twitch's session_reconnect message hands us a URL to reconnect to; only
    // trust it when it points at the real EventSub host, otherwise fall back
    // to the known-good constant (SSRF guard). On a match the returned URL is
    // rebuilt from the EVENTSUB_HOST literal (never from `parsed.host`/the raw
    // input) so the request's authority can never be attacker-controlled,
    // even though the path/query below still come from the validated input.
    // This breaks the taint path structurally for CodeQL js/request-forgery,
    // instead of just gating the original string behind a boolean check.
    private resolveConnectUrl(url: string): {
        url: string
        wasRejected: boolean
    } {
        try {
            const parsed = new URL(url)
            // A trailing dot denotes the DNS root and is semantically
            // identical to the bare hostname (RFC 1034 section 3.1). Strip
            // it before comparing so a legitimate FQDN reconnect url isn't
            // rejected on a technicality.
            const hostname = parsed.hostname.replace(/\.$/, '')
            if (
                parsed.protocol === 'wss:' &&
                hostname === EVENTSUB_HOST &&
                parsed.port === ''
            ) {
                return {
                    url: `wss://${EVENTSUB_HOST}${parsed.pathname}${parsed.search}`,
                    wasRejected: false,
                }
            }
        } catch {
            // Invalid URL - falls through to the warn + default below.
        }
        warnLog({
            message:
                'Twitch EventSub: rejected reconnect url outside the allowed host, using default',
            data: { url },
        })
        return { url: EVENTSUB_WS_URL, wasRejected: true }
    }

    private async connect(url: string): Promise<void> {
        return new Promise((resolve) => {
            this.ws = new WebSocket(url)
            this.ws.on('open', () =>
                debugLog({ message: 'Twitch EventSub: WebSocket connected' }),
            )
            this.ws.on('message', (data: WebSocket.RawData) => {
                try {
                    const msg = JSON.parse(data.toString()) as Message
                    this.handleMessage(msg)
                    if (msg.metadata.message_type === 'session_welcome')
                        resolve()
                } catch (err) {
                    errorLog({
                        message: 'Twitch EventSub: parse message error',
                        error: err,
                    })
                }
            })
            this.ws.on('close', (code, reason) => {
                debugLog({
                    message: `Twitch EventSub: WebSocket closed code=${code} reason=${reason.toString()}`,
                })
                this.clearKeepalive()
                this.ws = null
                this.sessionId = null
                if (code !== 1000 && this.client) {
                    // Unexpected close: the old session and its subscriptions are
                    // gone, so the reconnect gets a brand-new session. Clear the
                    // dedupe sets or subscription functions would skip every id and
                    // register zero subscriptions, silently killing notifications.
                    // (session_reconnect migration closes with code 1000 and keeps
                    // its subscriptions, so it intentionally bypasses this reset.)
                    this.subscribedUserIds.clear()
                    this.subscribedOfflineIds.clear()
                    this.subscribedUpdateIds.clear()
                    this.subscribedRaidIds.clear()
                    setTimeout(() => this.connect(EVENTSUB_WS_URL), 5000)
                }
            })
            this.ws.on('error', (err) =>
                errorLog({
                    message: 'Twitch EventSub: WebSocket error',
                    error: err,
                }),
            )
            this.ws.on('ping', () => this.ws?.pong())
        })
    }

    private handleMessage(msg: Message): void {
        switch (msg.metadata.message_type) {
            case 'session_welcome': {
                const p = msg.payload as WelcomePayload
                const sessionId = p.session.id
                this.sessionId = sessionId
                this.reconnectUrl = p.session.reconnect_url
                this.scheduleKeepalive(
                    p.session.keepalive_timeout_seconds * 1000,
                )
                void (async () => {
                    const results = await Promise.allSettled([
                        subscribeToStreamOnline(
                            sessionId,
                            this.clientId,
                            this.subscribedUserIds,
                        ),
                        subscribeToStreamOffline(
                            sessionId,
                            this.clientId,
                            this.subscribedOfflineIds,
                        ),
                        subscribeToChannelUpdate(
                            sessionId,
                            this.clientId,
                            this.subscribedUpdateIds,
                        ),
                        subscribeToChannelRaid(
                            sessionId,
                            this.clientId,
                            this.subscribedRaidIds,
                        ),
                    ])
                    results.forEach((result, index) => {
                        if (result.status === 'rejected') {
                            errorLog({
                                message: `Twitch EventSub: ${EVENT_LABELS[index]} subscription failed`,
                                error: result.reason as unknown,
                            })
                        }
                    })
                })()
                break
            }
            case 'session_keepalive':
                this.scheduleKeepalive(10000)
                break
            case 'notification': {
                const p = msg.payload as
                    | NotificationPayload
                    | StreamOfflinePayload
                    | ChannelUpdatePayload
                    | ChannelRaidPayload
                switch (p.subscription.type) {
                    case STREAM_ONLINE_TYPE:
                        if (this.client)
                            handleStreamOnline(
                                p as NotificationPayload,
                                this.client,
                            )
                        break
                    case STREAM_OFFLINE_TYPE:
                        if (this.client)
                            handleStreamOffline(
                                p as StreamOfflinePayload,
                                this.client,
                            )
                        break
                    case CHANNEL_UPDATE_TYPE:
                        if (this.client)
                            handleChannelUpdate(
                                p as ChannelUpdatePayload,
                                this.client,
                            )
                        break
                    case CHANNEL_RAID_TYPE:
                        if (this.client)
                            handleChannelRaid(
                                p as ChannelRaidPayload,
                                this.client,
                            )
                        break
                }
                break
            }
            case 'session_reconnect': {
                const p = msg.payload as ReconnectPayload
                if (p.session.reconnect_url && this.ws) {
                    this.ws.close(1000)
                    const { url: safeUrl, wasRejected } =
                        this.resolveConnectUrl(p.session.reconnect_url)
                    if (wasRejected) {
                        // The given reconnect url wasn't trusted, so this
                        // isn't a session-preserving reconnect: it's
                        // effectively a brand-new connection. Clear the
                        // dedupe sets or the new session's welcome would skip
                        // every id as "already subscribed" and register zero
                        // subscriptions (same failure mode as the unexpected
                        // close reset below, and this path bypasses that one
                        // since it closes with code 1000).
                        this.subscribedUserIds.clear()
                        this.subscribedOfflineIds.clear()
                        this.subscribedUpdateIds.clear()
                        this.subscribedRaidIds.clear()
                    }
                    this.connect(safeUrl)
                }
                break
            }
            case 'revocation':
                debugLog({
                    message: 'Twitch EventSub: subscription revoked',
                    data: msg,
                })
                break
            default:
                debugLog({
                    message: 'Twitch EventSub: unknown message type',
                    data: msg.metadata.message_type,
                })
        }
    }

    private scheduleKeepalive(ms: number): void {
        this.clearKeepalive()
        this.keepaliveTimeout = setTimeout(() => {
            this.keepaliveTimeout = null
            if (this.ws?.readyState === WebSocket.OPEN) this.ws.close(4005)
        }, ms)
    }

    private clearKeepalive(): void {
        if (this.keepaliveTimeout) {
            clearTimeout(this.keepaliveTimeout)
            this.keepaliveTimeout = null
        }
    }

    async refreshSubscriptions(): Promise<void> {
        this.subscribedUserIds.clear()
        this.subscribedOfflineIds.clear()
        this.subscribedUpdateIds.clear()
        this.subscribedRaidIds.clear()
        if (this.sessionId) {
            const results = await Promise.allSettled([
                subscribeToStreamOnline(
                    this.sessionId,
                    this.clientId,
                    this.subscribedUserIds,
                ),
                subscribeToStreamOffline(
                    this.sessionId,
                    this.clientId,
                    this.subscribedOfflineIds,
                ),
                subscribeToChannelUpdate(
                    this.sessionId,
                    this.clientId,
                    this.subscribedUpdateIds,
                ),
                subscribeToChannelRaid(
                    this.sessionId,
                    this.clientId,
                    this.subscribedRaidIds,
                ),
            ])
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    errorLog({
                        message: `Twitch EventSub: ${EVENT_LABELS[index]} subscription failed`,
                        error: result.reason,
                    })
                }
            })
        }
    }

    stop(): void {
        this.clearKeepalive()
        if (this.ws) {
            this.ws.close(1000)
            this.ws = null
        }
        this.sessionId = null
        this.client = null
        this.subscribedUserIds.clear()
        this.subscribedOfflineIds.clear()
        this.subscribedUpdateIds.clear()
        this.subscribedRaidIds.clear()
        infoLog({ message: 'Twitch EventSub: client stopped' })
    }
}

export const twitchEventSubClient = new TwitchEventSubClient()
