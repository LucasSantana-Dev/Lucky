import * as Sentry from '@sentry/react'
import { useEffect } from 'react'
import {
    createRoutesFromChildren,
    matchRoutes,
    useLocation,
    useNavigationType,
} from 'react-router-dom'

/**
 * Initialize the Sentry browser SDK. Safe to call once at module top before
 * React mounts (idempotent; no-op when SENTRY_DSN is missing).
 *
 * Wires:
 *   - Error reporting (uncaught + unhandled promise rejections)
 *   - browserTracingIntegration with React Router v7 instrumentation so
 *     route changes become transactions
 *   - Session replay (10% of sessions, 100% of sessions that hit an error)
 *
 * All sample rates and the DSN are configurable via Vite env vars so we
 * can tune ramp-up without code changes.
 */
export function initSentry(): void {
    const dsn = import.meta.env.VITE_SENTRY_DSN
    if (!dsn) return

    Sentry.init({
        dsn,
        environment:
            import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
        release:
            import.meta.env.VITE_SENTRY_RELEASE ??
            import.meta.env.VITE_COMMIT_SHA,
        integrations: [
            Sentry.reactRouterV7BrowserTracingIntegration({
                useEffect,
                useLocation,
                useNavigationType,
                createRoutesFromChildren,
                matchRoutes,
            }),
            Sentry.replayIntegration({
                maskAllText: false,
                blockAllMedia: false,
            }),
        ],
        tracesSampleRate: Number(
            import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1,
        ),
        replaysSessionSampleRate: Number(
            import.meta.env.VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? 0.1,
        ),
        replaysOnErrorSampleRate: Number(
            import.meta.env.VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ?? 1.0,
        ),
        tracePropagationTargets: [
            'localhost',
            /^\//,
            /^https:\/\/lucassantana\.tech\//,
            /^https:\/\/luk-homeserver\.com\.br\//,
        ],
    })
}

/**
 * Forward an error to Sentry without surfacing it to the user. Use from
 * catch blocks where the existing UI already shows an error state.
 */
export function captureFrontendException(
    error: unknown,
    context?: Record<string, unknown>,
): void {
    Sentry.captureException(error, context ? { extra: context } : undefined)
}

/**
 * Report a handled error: forward it to Sentry and echo it to the console
 * for local visibility (capture is a no-op without a DSN, e.g. in dev).
 * Use instead of bare console.error in catch blocks — the frontend
 * `no-console` lint rule enforces this.
 */
export function reportError(
    message: string,
    error: unknown,
    context?: Record<string, unknown>,
): void {
    captureFrontendException(error, { message, ...context })
    // eslint-disable-next-line no-console -- the one sanctioned console echo
    console.error(message, error)
}
