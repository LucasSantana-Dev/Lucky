import { getTwitchUserAccessToken } from './token'

const HELIX_USERS_URL = 'https://api.twitch.tv/helix/users'

export type TwitchUser = {
  id: string
  login: string
  display_name: string
}

export async function getTwitchUserByLogin(login: string): Promise<TwitchUser | null> {
  const token = await getTwitchUserAccessToken()
  const clientId = process.env.TWITCH_CLIENT_ID
  if (!token || !clientId) return null

  try {
    const url = `${HELIX_USERS_URL}?login=${encodeURIComponent(login)}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Client-Id': clientId,
      },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data: Array<{ id: string; login: string; display_name: string }> }
    const user = json.data?.[0]
    if (!user) return null
    return { id: user.id, login: user.login, display_name: user.display_name }
  } catch {
    return null
  }
}
