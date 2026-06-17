/**
 * Single source of truth for public-route SEO metadata.
 *
 * Consumed by BOTH:
 *  - the build-time prerender step (`scripts/prerender-seo.ts`), which writes the
 *    per-route `<head>` into the served HTML so non-JS crawlers + AI answer engines
 *    (which don't execute JS as of 2026) see distinct title/description/OG; and
 *  - the runtime on public pages (Changelog / Terms / Privacy call `usePageMetadata`
 *    from this map), so the live tab title can't drift from the served HTML.
 *
 * Landing is i18n-driven at runtime (`t('landing.meta.*')`); its `/` entry below is
 * the English served-HTML canonical and is kept identical to `locales/en.json`.
 * Docs has a dynamic per-`?page` runtime title; its `/docs` entry is the canonical
 * served-HTML shell. See ADR 2026-06-01-public-route-seo-rendering.
 */

export const SITE_ORIGIN = 'https://lucky.lucassantana.tech'

export interface RouteMeta {
    /** Path as routed. `'/'` is the root (and the SPA fallback for all other routes). */
    path: string
    title: string
    description: string
    /** Canonical path; defaults to `path`. Alias routes point at their primary. */
    canonical?: string
    /** Include in sitemap.xml. Aliases set this `false` to avoid duplicate-content URLs. */
    sitemap?: boolean
}

/**
 * The truly public, crawlable routes (verified against `App.tsx`: `PublicRoutes` +
 * the unauthenticated Landing). NOTE: `/features` is auth-gated (`AuthenticatedRoutes`,
 * `guardedRoute('automation', …)`) and redirects logged-out visitors to `/`, so it is
 * intentionally NOT prerendered despite issue #1131 listing it.
 */
export const PUBLIC_ROUTES: RouteMeta[] = [
    {
        path: '/',
        title: 'Lucky — Free Discord music bot with autoplay & dashboard',
        description:
            'YouTube, Spotify, SoundCloud music bot with genre-aware autoplay, smart radio, moderation, and web dashboard. Open-source, self-hostable, free forever.',
    },
    {
        path: '/docs',
        title: 'Documentation — Lucky',
        description:
            'Setup, configuration, music, moderation, and dashboard documentation for Lucky, the open-source self-hostable Discord bot.',
    },
    {
        path: '/changelog',
        title: 'Changelog · Lucky',
        description: 'Release notes and version history for Lucky.',
    },
    {
        path: '/terms-of-service',
        title: 'Terms of Service · Lucky',
        description:
            'Terms governing your use of the Lucky Discord bot and web dashboard.',
    },
    {
        path: '/terms',
        title: 'Terms of Service · Lucky',
        description:
            'Terms governing your use of the Lucky Discord bot and web dashboard.',
        canonical: '/terms-of-service',
        sitemap: false,
    },
    {
        path: '/privacy-policy',
        title: 'Privacy Policy · Lucky',
        description:
            'How Lucky collects, uses, and protects data for the bot and dashboard.',
    },
    {
        path: '/privacy',
        title: 'Privacy Policy · Lucky',
        description:
            'How Lucky collects, uses, and protects data for the bot and dashboard.',
        canonical: '/privacy-policy',
        sitemap: false,
    },
]

/** Path → metadata lookup for the runtime hook. */
export const ROUTE_META_BY_PATH: Record<string, RouteMeta> = Object.fromEntries(
    PUBLIC_ROUTES.map((r) => [r.path, r]),
)

/** Runtime title/description for a public page, from the single source of truth.
 *  Throws if the path is not a registered public route (caught at build/test time). */
export function metaFor(path: string): { title: string; description: string } {
    const m = ROUTE_META_BY_PATH[path]
    if (!m) {
        throw new Error(`routeMeta: no metadata registered for "${path}"`)
    }
    return { title: m.title, description: m.description }
}

/**
 * Dashboard/app route prefixes that should NOT be crawled (they redirect logged-out
 * visitors to `/` and only render under auth). Used to generate robots.txt disallows.
 */
export const DISALLOWED_PATHS: string[] = [
    '/api/',
    '/login',
    '/servers',
    '/admin',
    '/config',
    '/settings',
    '/features',
    '/moderation',
    '/automod',
    '/logs',
    '/commands',
    '/automessages',
    '/embed-builder',
    '/reaction-roles',
    '/guild-automation',
    '/levels',
    '/starboard',
    '/music',
    '/lyrics',
    '/twitch',
    '/lastfm',
    '/spotify',
]

/**
 * Validate the map for completeness. Throws on any drift so the build (and a unit
 * test) fail loudly rather than shipping a route with missing/duplicate metadata.
 */
export function assertRouteMetaValid(
    routes: RouteMeta[] = PUBLIC_ROUTES,
): void {
    const seen = new Set<string>()
    for (const r of routes) {
        if (!r.path.startsWith('/')) {
            throw new Error(
                `routeMeta: path must start with "/" (got "${r.path}")`,
            )
        }
        if (!r.title.trim()) {
            throw new Error(`routeMeta: empty title for "${r.path}"`)
        }
        if (!r.description.trim()) {
            throw new Error(`routeMeta: empty description for "${r.path}"`)
        }
        if (seen.has(r.path)) {
            throw new Error(`routeMeta: duplicate path "${r.path}"`)
        }
        seen.add(r.path)
    }
}
