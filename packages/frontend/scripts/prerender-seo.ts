/**
 * Build-time per-route SEO generation (runs AFTER `vite build`, on `dist/`).
 *
 * For each public route it writes a `dist/<route>/index.html` copy of the built
 * `index.html` with the `<head>` swapped (via the pure transforms in
 * `src/lib/seo/prerender.ts`) — so non-JS crawlers see real per-route metadata.
 * The page body is left as the unrendered SPA shell (`<div id="root">`), so the
 * client still `createRoot`-mounts normally (no hydration step, no mismatch).
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
import { PUBLIC_ROUTES, assertRouteMetaValid } from '../src/lib/seo/routeMeta'
import {
    renderRouteHtml,
    buildSitemap,
    buildRobots,
} from '../src/lib/seo/prerender'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(scriptDir, '../dist')
const publicDir = resolve(scriptDir, '../public')

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
    // Fail loudly before writing anything if the metadata map is incomplete.
    assertRouteMetaValid()

    const templatePath = join(distDir, 'index.html')
    if (!existsSync(templatePath)) {
        throw new Error(
            `prerender-seo: ${templatePath} not found — run \`vite build\` first.`,
        )
    }
    const template = readFileSync(templatePath, 'utf8')

    // A throw mid-loop leaves dist/ partially written; that's acceptable because a
    // non-zero exit fails the build and CI/CD rejects the incomplete artifact.
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
