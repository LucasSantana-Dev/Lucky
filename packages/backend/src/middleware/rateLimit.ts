import rateLimit from 'express-rate-limit'
import { recordWithCooldown, emitAlert } from '@lucky/shared/utils/alerts'

export const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
})

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many auth attempts, please try again later' },
    handler(req, res) {
        const ip = req.ip ?? 'unknown'
        if (
            recordWithCooldown(
                `auth-limit:${ip}`,
                60 * 60_000,
                3,
                4 * 60 * 60_000,
            )
        ) {
            emitAlert({
                title: '⚠️ Auth brute-force detected',
                description: `IP \`${ip}\` has exhausted the auth rate limit 3+ times in 1 hour`,
                color: 'warning',
                fields: [{ name: 'IP', value: ip }],
            }).catch(() => {})
        }
        res.status(429).json({
            error: 'Too many auth attempts, please try again later',
        })
    },
})

export const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many write requests, please try again later' },
})
