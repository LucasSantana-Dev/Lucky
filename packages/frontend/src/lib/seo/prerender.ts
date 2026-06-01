/**
 * Pure HTML/string transforms for the build-time SEO prerender step
 * (`scripts/prerender-seo.ts`). Extracted here so they can be unit-tested without
 * Node `fs` or the resvg native binary — this module has NO side effects and is
 * safe to import in vitest.
 */
import { SITE_ORIGIN, DISALLOWED_PATHS, type RouteMeta } from './routeMeta'

export const OG_IMAGE_PATH = '/og-image.png'
export const OG_IMAGE_URL = SITE_ORIGIN + OG_IMAGE_PATH

export function escAttr(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

export function escText(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Replace (or insert before `</head>`) a `<meta {attr}="{key}" content="…">` tag,
 * tolerant of attribute order in the built HTML.
 *
 * `attr` and `key` are TRUSTED hardcoded literals from the call site (not user
 * input), so only `content` is escaped; `key` is regex-escaped purely for a safe
 * match, not for security.
 */
export function setMeta(
    html: string,
    attr: 'name' | 'property',
    key: string,
    content: string,
): string {
    const tag = `<meta ${attr}="${key}" content="${escAttr(content)}" />`
    const re = new RegExp(
        `<meta[^>]*\\b${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
        'i',
    )
    if (re.test(html)) return html.replace(re, tag)
    return html.replace('</head>', `    ${tag}\n  </head>`)
}

export function setCanonical(html: string, url: string): string {
    const tag = `<link rel="canonical" href="${escAttr(url)}" />`
    if (/<link[^>]*rel=["']canonical["'][^>]*>/i.test(html)) {
        return html.replace(/<link[^>]*rel=["']canonical["'][^>]*>/i, tag)
    }
    return html.replace('</head>', `    ${tag}\n  </head>`)
}

/**
 * Produce a route's served HTML by swapping the `<head>` of the built template.
 *
 * For alias routes (e.g. `/terms`), `og:url` intentionally reflects the REQUESTED
 * path while `<link rel="canonical">` points at the primary (`/terms-of-service`):
 * social shares of either URL preview correctly, while search engines dedupe to the
 * canonical. The body is left untouched (the SPA `<div id="root">` shell).
 */
export function renderRouteHtml(template: string, r: RouteMeta): string {
    const pageUrl = SITE_ORIGIN + r.path
    const canonicalUrl = SITE_ORIGIN + (r.canonical ?? r.path)
    let html = template
    html = html.replace(
        /<title>[\s\S]*?<\/title>/i,
        `<title>${escText(r.title)}</title>`,
    )
    html = setMeta(html, 'name', 'description', r.description)
    html = setMeta(html, 'property', 'og:title', r.title)
    html = setMeta(html, 'property', 'og:description', r.description)
    html = setMeta(html, 'property', 'og:url', pageUrl)
    html = setMeta(html, 'property', 'og:image', OG_IMAGE_URL)
    html = setMeta(html, 'name', 'twitter:title', r.title)
    html = setMeta(html, 'name', 'twitter:description', r.description)
    html = setMeta(html, 'name', 'twitter:image', OG_IMAGE_URL)
    html = setCanonical(html, canonicalUrl)
    return html
}

export function buildSitemap(routes: RouteMeta[]): string {
    const urls = routes
        .filter((r) => r.sitemap !== false)
        .map(
            (r) =>
                `  <url><loc>${escText(SITE_ORIGIN + r.path)}</loc><changefreq>weekly</changefreq></url>`,
        )
        .join('\n')
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export function buildRobots(): string {
    const disallows = DISALLOWED_PATHS.map((p) => `Disallow: ${p}`).join('\n')
    return `User-agent: *\nAllow: /\n${disallows}\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`
}
