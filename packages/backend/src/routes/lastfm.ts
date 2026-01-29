import type { Express, Request, Response } from 'express'
import crypto from 'node:crypto'
import { errorLog, debugLog } from '@lukbot/shared/utils'
import { lastFmLinkService } from '@lukbot/shared/services'
import { exchangeTokenForSession, isLastFmAuthConfigured } from '../services/LastFmAuthService'

const LASTFM_STATE_COOKIE = 'lastfm_state'
const STATE_MAX_AGE_SEC = 600

function getLinkSecret(): string {
  const secret = process.env.LASTFM_LINK_SECRET ?? process.env.WEBAPP_SESSION_SECRET
  if (!secret) throw new Error('LASTFM_LINK_SECRET or WEBAPP_SESSION_SECRET required for Last.fm link')
  return secret
}

function encodeState(discordId: string, secret: string): string {
  const payload = Buffer.from(discordId, 'utf8').toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(discordId, 'utf8').digest('hex')
  return `${payload}.${sig}`
}

function decodeAndVerifyState(state: string, secret: string): string | null {
  const parts = state.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sig] = parts
  let discordId: string
  try {
    discordId = Buffer.from(payloadB64, 'base64url').toString('utf8')
  } catch {
    return null
  }
  const expected = crypto.createHmac('sha256', secret).update(discordId, 'utf8').digest('hex')
  if (crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'))) {
    return discordId
  }
  return null
}

function getFrontendUrl(): string {
  return process.env.WEBAPP_FRONTEND_URL ?? 'http://localhost:5173'
}

export function setupLastFmRoutes(app: Express): void {
  app.get('/api/lastfm/connect', (req: Request, res: Response) => {
    try {
      if (!isLastFmAuthConfigured()) {
        const frontendUrl = getFrontendUrl()
        return res.redirect(`${frontendUrl}/?error=lastfm_not_configured`)
      }
      const state = req.query.state
      if (!state || typeof state !== 'string') {
        const frontendUrl = getFrontendUrl()
        return res.redirect(`${frontendUrl}/?error=lastfm_invalid_state`)
      }
      const secret = getLinkSecret()
      const discordId = decodeAndVerifyState(state, secret)
      if (!discordId) {
        const frontendUrl = getFrontendUrl()
        return res.redirect(`${frontendUrl}/?error=lastfm_invalid_state`)
      }
      res.cookie(LASTFM_STATE_COOKIE, state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: STATE_MAX_AGE_SEC * 1000,
        path: '/',
      })
      const apiKey = process.env.LASTFM_API_KEY
      const authUrl = `https://www.last.fm/api/auth?api_key=${encodeURIComponent(apiKey!)}`
      res.redirect(authUrl)
    } catch (error) {
      errorLog({ message: 'Last.fm connect error', error })
      const frontendUrl = getFrontendUrl()
      res.redirect(`${frontendUrl}/?error=lastfm_connect_error`)
    }
  })

  app.get('/api/lastfm/callback', async (req: Request, res: Response) => {
    const frontendUrl = getFrontendUrl()
    try {
      const token = req.query.token
      const stateFromCookie = req.cookies?.[LASTFM_STATE_COOKIE]
      res.clearCookie(LASTFM_STATE_COOKIE, { path: '/' })
      if (!token || typeof token !== 'string') {
        return res.redirect(`${frontendUrl}/?error=lastfm_missing_token`)
      }
      if (!stateFromCookie || typeof stateFromCookie !== 'string') {
        return res.redirect(`${frontendUrl}/?error=lastfm_missing_state`)
      }
      const secret = getLinkSecret()
      const discordId = decodeAndVerifyState(stateFromCookie, secret)
      if (!discordId) {
        return res.redirect(`${frontendUrl}/?error=lastfm_invalid_state`)
      }
      const session = await exchangeTokenForSession(token)
      if (!session) {
        return res.redirect(`${frontendUrl}/?error=lastfm_exchange_failed`)
      }
      const ok = await lastFmLinkService.set(discordId, session.sessionKey, session.username)
      if (!ok) {
        return res.redirect(`${frontendUrl}/?error=lastfm_save_failed`)
      }
      debugLog({ message: 'Last.fm linked', data: { discordId, username: session.username } })
      res.redirect(`${frontendUrl}/?lastfm_linked=true`)
    } catch (error) {
      errorLog({ message: 'Last.fm callback error', error })
      res.redirect(`${frontendUrl}/?error=lastfm_callback_error`)
    }
  })
}
