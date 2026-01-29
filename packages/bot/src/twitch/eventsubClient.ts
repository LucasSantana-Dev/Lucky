import WebSocket from 'ws'
import type { Client } from 'discord.js'
import { EmbedBuilder } from 'discord.js'
import { errorLog, infoLog, debugLog } from '@lukbot/shared/utils'
import { twitchNotificationService } from '@lukbot/shared/services'
import { getTwitchUserAccessToken } from './token'

const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws'
const EVENTSUB_API_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions'
const STREAM_ONLINE_TYPE = 'stream.online'
const STREAM_ONLINE_VERSION = '1'

type WelcomePayload = {
  session: {
    id: string
    status: string
    keepalive_timeout_seconds: number
    reconnect_url: string | null
  }
}

type NotificationPayload = {
  subscription: {
    type: string
    condition: { broadcaster_user_id: string }
  }
  event: {
    id: string
    broadcaster_user_id: string
    broadcaster_user_login: string
    broadcaster_user_name: string
    type: string
    started_at: string
  }
}

type ReconnectPayload = {
  session: { reconnect_url: string }
}

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

  async start(discordClient: Client): Promise<void> {
    this.clientId = process.env.TWITCH_CLIENT_ID ?? ''
    if (!this.clientId) {
      infoLog({ message: 'Twitch EventSub: TWITCH_CLIENT_ID not set, skipping' })
      return
    }

    const token = await getTwitchUserAccessToken()
    if (!token) {
      infoLog({
        message:
          'Twitch EventSub: user access token not available (set TWITCH_ACCESS_TOKEN and optionally TWITCH_REFRESH_TOKEN), skipping',
      })
      return
    }

    this.client = discordClient
    await this.connect(EVENTSUB_WS_URL)
  }

  private async connect(url: string): Promise<void> {
    return new Promise((resolve) => {
      this.ws = new WebSocket(url)

      this.ws.on('open', () => {
        debugLog({ message: 'Twitch EventSub: WebSocket connected' })
      })

      this.ws.on('message', (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(data.toString()) as Message
          this.handleMessage(msg)
          if (msg.metadata.message_type === 'session_welcome') {
            resolve()
          }
        } catch (err) {
          errorLog({ message: 'Twitch EventSub: parse message error', error: err })
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
          setTimeout(() => this.connect(EVENTSUB_WS_URL), 5000)
        }
      })

      this.ws.on('error', (err) => {
        errorLog({ message: 'Twitch EventSub: WebSocket error', error: err })
      })

      this.ws.on('ping', () => {
        this.ws?.pong()
      })
    })
  }

  private handleMessage(msg: Message): void {
    switch (msg.metadata.message_type) {
      case 'session_welcome': {
        const payload = msg.payload as WelcomePayload
        this.sessionId = payload.session.id
        this.reconnectUrl = payload.session.reconnect_url
        this.scheduleKeepalive(payload.session.keepalive_timeout_seconds * 1000)
        this.subscribeToStreamOnline()
        break
      }
      case 'session_keepalive':
        this.scheduleKeepalive(10000)
        break
      case 'notification': {
        const payload = msg.payload as NotificationPayload
        if (payload.subscription.type === STREAM_ONLINE_TYPE) {
          this.handleStreamOnline(payload)
        }
        break
      }
      case 'session_reconnect': {
        const payload = msg.payload as ReconnectPayload
        const url = payload.session.reconnect_url
        if (url && this.ws) {
          this.ws.close(1000)
          this.connect(url)
        }
        break
      }
      case 'revocation':
        debugLog({ message: 'Twitch EventSub: subscription revoked', data: msg })
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
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.close(4005)
      }
    }, ms)
  }

  private clearKeepalive(): void {
    if (this.keepaliveTimeout) {
      clearTimeout(this.keepaliveTimeout)
      this.keepaliveTimeout = null
    }
  }

  private async subscribeToStreamOnline(): Promise<void> {
    const token = await getTwitchUserAccessToken()
    if (!token || !this.sessionId) return

    const userIds = await twitchNotificationService.getDistinctTwitchUserIds()
    if (userIds.length === 0) {
      debugLog({ message: 'Twitch EventSub: no streamers to subscribe to' })
      return
    }

    for (const broadcasterUserId of userIds) {
      if (this.subscribedUserIds.has(broadcasterUserId)) continue
      const ok = await this.createSubscription(broadcasterUserId, token)
      if (ok) this.subscribedUserIds.add(broadcasterUserId)
    }
  }

  private async createSubscription(
    broadcasterUserId: string,
    accessToken: string,
  ): Promise<boolean> {
    try {
      const res = await fetch(EVENTSUB_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': this.clientId,
        },
        body: JSON.stringify({
          type: STREAM_ONLINE_TYPE,
          version: STREAM_ONLINE_VERSION,
          condition: { broadcaster_user_id: broadcasterUserId },
          transport: { method: 'websocket', session_id: this.sessionId },
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        errorLog({
          message: `Twitch EventSub: create subscription failed ${res.status}`,
          data: text,
        })
        return false
      }
      debugLog({
        message: `Twitch EventSub: subscribed to stream.online for ${broadcasterUserId}`,
      })
      return true
    } catch (err) {
      errorLog({
        message: 'Twitch EventSub: create subscription error',
        error: err,
      })
      return false
    }
  }

  private async handleStreamOnline(payload: NotificationPayload): Promise<void> {
    const {
      broadcaster_user_id: twitchUserId,
      broadcaster_user_login: login,
      broadcaster_user_name: name,
      started_at: startedAt,
    } = payload.event

    const notifications = await twitchNotificationService.getNotificationsByTwitchUserId(
      twitchUserId,
    )
    if (notifications.length === 0 || !this.client) return

    const streamUrl = `https://twitch.tv/${login}`
    const embed = new EmbedBuilder()
      .setColor(0x9146ff)
      .setTitle(`${name} is live`)
      .setURL(streamUrl)
      .setDescription(`**${name}** is now streaming on Twitch.`)
      .addFields({ name: 'Channel', value: streamUrl, inline: false })
      .setTimestamp(new Date(startedAt))
      .setFooter({ text: 'Twitch' })

    for (const notif of notifications) {
      try {
        const channel = await this.client.channels.fetch(notif.discordChannelId)
        if (channel?.isTextBased() && !channel.isDMBased()) {
          await channel.send({ embeds: [embed] })
        }
      } catch (err) {
        errorLog({
          message: `Twitch EventSub: failed to send notification to channel ${notif.discordChannelId}`,
          error: err,
        })
      }
    }
  }

  async refreshSubscriptions(): Promise<void> {
    this.subscribedUserIds.clear()
    if (this.sessionId) {
      await this.subscribeToStreamOnline()
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
    infoLog({ message: 'Twitch EventSub: client stopped' })
  }
}

export const twitchEventSubClient = new TwitchEventSubClient()
