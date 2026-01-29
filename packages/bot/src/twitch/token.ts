const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const TWITCH_VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate'

export type TwitchTokenResult = {
  accessToken: string
  expiresAt: number
}

let cachedToken: TwitchTokenResult | null = null

export function getTwitchEnv(): {
  clientId: string
  clientSecret: string
  accessToken: string | undefined
  refreshToken: string | undefined
} {
  const clientId = process.env.TWITCH_CLIENT_ID ?? ''
  const clientSecret = process.env.TWITCH_CLIENT_SECRET ?? ''
  const accessToken = process.env.TWITCH_ACCESS_TOKEN
  const refreshToken = process.env.TWITCH_REFRESH_TOKEN
  return { clientId, clientSecret, accessToken, refreshToken }
}

export function isTwitchConfigured(): boolean {
  const { clientId, clientSecret, accessToken } = getTwitchEnv()
  return Boolean(clientId && clientSecret && accessToken)
}

export async function getTwitchUserAccessToken(): Promise<string | null> {
  const { clientId, clientSecret, accessToken, refreshToken } = getTwitchEnv()
  if (!clientId || !clientSecret || !accessToken) {
    return null
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken
  }

  if (refreshToken) {
    const refreshed = await refreshTwitchToken(clientId, clientSecret, refreshToken)
    if (refreshed) {
      cachedToken = refreshed
      return refreshed.accessToken
    }
  }

  cachedToken = { accessToken, expiresAt: Date.now() + 4 * 60 * 60 * 1000 }
  return accessToken
}

async function refreshTwitchToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<TwitchTokenResult | null> {
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })
    const res = await fetch(TWITCH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) {
      return null
    }
    const data = (await res.json()) as {
      access_token: string
      expires_in: number
    }
    return {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    }
  } catch {
    return null
  }
}

export function clearTwitchTokenCache(): void {
  cachedToken = null
}
