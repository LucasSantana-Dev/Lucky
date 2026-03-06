import type { Request, Response } from 'express'
import { debugLog, errorLog } from '@lukbot/shared/utils'
import { discordOAuthService } from '../services/DiscordOAuthService'
import { sessionService } from '../services/SessionService'

export async function handleOAuthCallback(req: Request, res: Response): Promise<void> {
	try {
		const { code, error } = req.query
		const frontendUrl = process.env.WEBAPP_FRONTEND_URL ?? 'http://localhost:5173'

		if (error) {
			errorLog({ message: 'Discord OAuth error', data: { error } })
			res.redirect(`${frontendUrl}/?error=auth_failed&message=${encodeURIComponent(String(error))}`)
			return
		}

		if (!code || typeof code !== 'string') {
			res.redirect(`${frontendUrl}/?error=missing_code`)
			return
		}

		debugLog({ message: 'Discord OAuth callback received', data: { code: code.substring(0, 10) } })

		const tokenData = await discordOAuthService.exchangeCodeForToken(code)
		const userInfo = await discordOAuthService.getUserInfo(tokenData.access_token)
		const sessionId = req.sessionID

		if (!sessionId) {
			res.redirect(`${frontendUrl}/?error=session_failed`)
			return
		}

		const expiresAt = Date.now() + tokenData.expires_in * 1000
		await sessionService.setSession(sessionId, {
			userId: userInfo.id,
			accessToken: tokenData.access_token,
			refreshToken: tokenData.refresh_token,
			user: userInfo,
			expiresAt,
		})

		req.session.authenticated = true
		req.session.userId = userInfo.id

		debugLog({
			message: 'User authenticated successfully',
			data: { userId: userInfo.id, sessionId, sessionCookie: req.session.cookie },
		})

		await new Promise<void>((resolve, reject) => {
			req.session.save((err) => {
				if (err) {
					errorLog({ message: 'Error saving session:', error: err })
					reject(err)
					return
				}
				debugLog({
					message: 'Session saved successfully',
					data: { sessionId, cookieSet: !!res.getHeader('Set-Cookie') },
				})
				resolve()
			})
		})

		debugLog({
			message: 'Redirecting to frontend',
			data: { frontendUrl, sessionId, cookieHeader: res.getHeader('Set-Cookie') },
		})

		res.redirect(`${frontendUrl}/?authenticated=true`)
	} catch (error) {
		errorLog({ message: 'Error in Discord OAuth callback:', error })
		const frontendUrl = process.env.WEBAPP_FRONTEND_URL ?? 'http://localhost:5173'
		res.redirect(`${frontendUrl}/?error=auth_failed&message=authentication_error`)
	}
}
