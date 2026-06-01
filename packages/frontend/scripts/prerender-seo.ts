/**
 * Build-time per-route SEO generation (runs AFTER `vite build`, on `dist/`).
 *
 * For each public route it writes a `dist/<route>/index.html` copy of the built
 * `index.html` with the `<head>` (title, description, OG, Twitter, canonical)
 * swapped from the shared `routeMeta` map — so non-JS crawlers see real per-route
 * metadata. The page body is left as the unrendered SPA shell (`<div id="root">`),
 * so the client still `createRoot`-mounts normally (no hydration step, no mismatch).
 *
 * Also emits `sitemap.xml`, `robots.txt`, and a real 1200×630 `og-image.png`.
 * Closes issues #1131 + #1132. See ADR 2026-06-01-public-route-seo-rendering.
 */
import {
    readFileSync,
    writeFileSync,
    mkdirSync,
    copyFileSync,
    existsSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    PUBLIC_ROUTES,
    DISALLOWED_PATHS,
    SITE_ORIGIN,
    assertRouteMetaValid,
    type RouteMeta,
} from '../src/lib/seo/routeMeta'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(scriptDir, '../dist')
const publicDir = resolve(scriptDir, '../public')
const OG_IMAGE_PATH = '/og-image.png'
const OG_IMAGE_URL = SITE_ORIGIN + OG_IMAGE_PATH

function escAttr(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function escText(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Replace (or insert before </head>) a `<meta {attr}="{key}" content="…">` tag,
 *  tolerant of attribute order in the built HTML. */
function setMeta(
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

function setCanonical(html: string, url: string): string {
    const tag = `<link rel="canonical" href="${escAttr(url)}" />`
    if (/<link[^>]*rel=["']canonical["'][^>]*>/i.test(html)) {
        return html.replace(/<link[^>]*rel=["']canonical["'][^>]*>/i, tag)
    }
    return html.replace('</head>', `    ${tag}\n  </head>`)
}

function renderRouteHtml(template: string, r: RouteMeta): string {
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

function writeRouteFile(html: string, routePath: string): string {
    // '/' -> dist/index.html ; '/docs' -> dist/docs/index.html
    const rel =
        routePath === '/'
            ? 'index.html'
            : join(routePath.slice(1), 'index.html')
    const out = join(distDir, rel)
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, html, 'utf8')
    return rel
}

function buildSitemap(routes: RouteMeta[]): string {
    const urls = routes
        .filter((r) => r.sitemap !== false)
        .map(
            (r) =>
                `  <url><loc>${escText(SITE_ORIGIN + r.path)}</loc><changefreq>weekly</changefreq></url>`,
        )
        .join('\n')
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

function buildRobots(): string {
    const disallows = DISALLOWED_PATHS.map((p) => `Disallow: ${p}`).join('\n')
    return `User-agent: *\nAllow: /\n${disallows}\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`
}

/** Generate a real 1200×630 og-image (brand background + centered logo) via resvg.
 *  Fail-soft: on any error, fall back to copying the existing logo so /og-image.png
 *  always resolves to a real image (build never breaks on the image). */
async function generateOgImage(): Promise<string> {
    const out = join(distDir, 'og-image.png')
    const logoPath = join(publicDir, 'lucky-logo.png')
    try {
        const { Resvg } = await import('@resvg/resvg-js')
        let logoTag = ''
        if (existsSync(logoPath)) {
            const b64 = readFileSync(logoPath).toString('base64')
            // 360×360 logo centered on the 1200×630 canvas.
            logoTag = `<image href="data:image/png;base64,${b64}" x="420" y="135" width="360" height="360" preserveAspectRatio="xMidYMid meet"/>`
        }
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0b0b14"/><stop offset="1" stop-color="#16121f"/>
  </linearGradient></defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  ${logoTag}
</svg>`
        const png = new Resvg(svg, { fitTo: { mode: 'original' } })
            .render()
            .asPng()
        writeFileSync(out, png)
        return 'generated (1200×630, resvg)'
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        if (existsSync(logoPath)) {
            copyFileSync(logoPath, out)
            return `fallback to lucky-logo.png (resvg unavailable: ${reason})`
        }
        return `SKIPPED — no og-image written (resvg failed: ${reason}, no logo fallback)`
    }
}

async function main(): Promise<void> {
    assertRouteMetaValid()

    const templatePath = join(distDir, 'index.html')
    if (!existsSync(templatePath)) {
        throw new Error(
            `prerender-seo: ${templatePath} not found — run \`vite build\` first.`,
        )
    }
    const template = readFileSync(templatePath, 'utf8')

    const written: string[] = []
    for (const route of PUBLIC_ROUTES) {
        written.push(
            writeRouteFile(renderRouteHtml(template, route), route.path),
        )
    }

    writeFileSync(
        join(distDir, 'sitemap.xml'),
        buildSitemap(PUBLIC_ROUTES),
        'utf8',
    )
    writeFileSync(join(distDir, 'robots.txt'), buildRobots(), 'utf8')
    const ogStatus = await generateOgImage()

    console.log('[prerender-seo] per-route HTML written:')
    for (const rel of written) console.log(`  - dist/${rel}`)
    console.log('[prerender-seo] dist/sitemap.xml, dist/robots.txt written')
    console.log(`[prerender-seo] og-image: ${ogStatus}`)
}

main().catch((err) => {
    console.error('[prerender-seo] FAILED:', err)
    process.exit(1)
})
