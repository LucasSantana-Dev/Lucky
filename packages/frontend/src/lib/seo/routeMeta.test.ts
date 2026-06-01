import { describe, expect, it } from 'vitest'
import {
    PUBLIC_ROUTES,
    ROUTE_META_BY_PATH,
    DISALLOWED_PATHS,
    SITE_ORIGIN,
    assertRouteMetaValid,
    metaFor,
    type RouteMeta,
} from './routeMeta'

describe('routeMeta', () => {
    it('is internally valid (non-empty, unique paths)', () => {
        expect(() => assertRouteMetaValid()).not.toThrow()
    })

    it('covers exactly the verified public routes', () => {
        const paths = PUBLIC_ROUTES.map((r) => r.path).sort()
        expect(paths).toEqual(
            [
                '/',
                '/changelog',
                '/docs',
                '/privacy',
                '/privacy-policy',
                '/terms',
                '/terms-of-service',
            ].sort(),
        )
    })

    it('does NOT prerender the auth-gated /features route', () => {
        expect(ROUTE_META_BY_PATH['/features']).toBeUndefined()
    })

    it('points alias routes at their canonical and excludes them from the sitemap', () => {
        expect(ROUTE_META_BY_PATH['/terms']?.canonical).toBe(
            '/terms-of-service',
        )
        expect(ROUTE_META_BY_PATH['/terms']?.sitemap).toBe(false)
        expect(ROUTE_META_BY_PATH['/privacy']?.canonical).toBe(
            '/privacy-policy',
        )
        expect(ROUTE_META_BY_PATH['/privacy']?.sitemap).toBe(false)
    })

    it('lists only canonical (non-alias) routes in the sitemap set', () => {
        const inSitemap = PUBLIC_ROUTES.filter((r) => r.sitemap !== false).map(
            (r) => r.path,
        )
        expect(inSitemap.sort()).toEqual(
            [
                '/',
                '/changelog',
                '/docs',
                '/privacy-policy',
                '/terms-of-service',
            ].sort(),
        )
    })

    it('never disallows a public canonical path in robots', () => {
        const canonicals = PUBLIC_ROUTES.filter((r) => r.sitemap !== false).map(
            (r) => r.canonical ?? r.path,
        )
        for (const c of canonicals) {
            // '/' is allowed; no disallow rule should equal a canonical public path
            expect(DISALLOWED_PATHS).not.toContain(c)
        }
    })

    it('exposes the production origin', () => {
        expect(SITE_ORIGIN).toBe('https://lucky.lucassantana.tech')
    })

    it('rejects an empty title', () => {
        const bad: RouteMeta[] = [{ path: '/x', title: '  ', description: 'd' }]
        expect(() => assertRouteMetaValid(bad)).toThrow(/empty title/)
    })

    it('rejects a duplicate path', () => {
        const bad: RouteMeta[] = [
            { path: '/x', title: 't', description: 'd' },
            { path: '/x', title: 't2', description: 'd2' },
        ]
        expect(() => assertRouteMetaValid(bad)).toThrow(/duplicate path/)
    })

    it('metaFor returns title+description for a known route', () => {
        expect(metaFor('/changelog')).toEqual({
            title: 'Changelog · Lucky',
            description: 'Release notes and version history for Lucky.',
        })
    })

    it('metaFor throws on an unregistered path', () => {
        expect(() => metaFor('/nope')).toThrow(/no metadata registered/)
    })
})
