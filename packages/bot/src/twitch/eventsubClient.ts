import WebSocket from 'ws'
import type { Client } from 'discord.js'
import { errorLog, infoLog, debugLog } from '@lucky/shared/utils'
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

const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws'
const STREAM_ONLINE_TYPE = 'stream.online'
const STREAM_OFFLINE_TYPE = 'stream.offline'
const CHANNEL_UPDATE_TYPE = 'channel.update'
const CHANNEL_RAID_TYPE = 'channel.raid'

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
                this.sessionId = p.session.id
                this.reconnectUrl = p.session.reconnect_url
                this.scheduleKeepalive(
                    p.session.keepalive_timeout_seconds * 1000,
                )
                void Promise.all([
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
                ]).catch((error) =>
                    errorLog({
                        message:
                            'Twitch EventSub: subscribe on session_welcome failed',
                        error,
                    }),
                )
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
                    this.connect(p.session.reconnect_url)
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
            await Promise.all([
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
