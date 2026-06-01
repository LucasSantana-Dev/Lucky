# ADR — Public-route SEO rendering for the SPA: build-time per-route meta, not a framework

- **Date:** 2026-06-01
- **Status:** Accepted
- **Owner:** Lucas Santana
- **Related:** issues #1131 (per-route meta in served HTML), #1132 (robots/sitemap/og-image),
  tracking #1126 (web-app audit 2026-06-01); plan
  `.claude/plans/2026-06-01-public-route-seo-prerender.md`; decided via
  `/research-and-decide` (Phase-1 4-lens research + critic challenge).

## Context

`packages/frontend` (lucky-webapp, https://lucky.lucassantana.tech) is a
**client-rendered SPA**: Vite 8 + React 19.2 + `react-router-dom` 7.15 in
**declarative mode** (`<BrowserRouter><Routes><Route/>`), all pages `React.lazy()`
code-split. A single static `index.html` `<head>` is served for **every** route;
the `usePageMetadata` hook only mutates `document.title` + description **client-side**
(it doesn't touch OG/Twitter). So every public route ships identical, generic
metadata in its served HTML — `og:image` is a `/favicon.png`, `twitter:card` is
`summary`.

This makes the marketing/docs pages effectively invisible to anything that doesn't
execute JavaScript. As of June 2026, **AI answer-engine crawlers (ChatGPT, Claude,
Perplexity) do not run JS**; only Google/Gemini renders it. Per-route metadata in
the **served** HTML is therefore a requirement, not a nicety (issue #1131). The site
also lacks `robots.txt`, a `sitemap.xml`, and a real OG image (issue #1132).

Constraints that shape the choice: hobby OSS, **low maintenance budget**, solo
maintainer; **dual deploy** — Vercel (`framework: vite`, SPA rewrite
`/:path* → /index.html`) **and** a homelab static nginx container
(`nginx/frontend.conf` uses `try_files $uri $uri/ /index.html`); ~6 public routes
with largely static content; ~24 auth-gated dashboard routes that **must stay pure
CSR**. A host-locked solution loses the homelab path.

Scope correction found during implementation: issue #1131 listed `/features` among
the public routes, but it is auth-gated (`AuthenticatedRoutes` /
`guardedRoute('automation', …)`, which redirects logged-out visitors to `/`), so it
is excluded from prerendering. The verified public set is `/`, `/docs`, `/changelog`,
`/terms` (+ `/terms-of-service`), and `/privacy` (+ `/privacy-policy`).

## Decision

Adopt **build-time per-route META-ONLY HTML generation**, driven by a single shared
metadata map; **do not migrate the router or adopt a rendering framework, and do not
server-render page bodies.**

A post-build step writes `dist/<route>/index.html` copies of the built `index.html`
with the `<head>` (title, description, canonical, OG, Twitter, JSON-LD) swapped per
route from `src/lib/seo/routeMeta.ts`. The **body stays the unrendered SPA shell**
(`<div id="root">`), so `createRoot` mounts as today — **no hydration step, no
hydration-mismatch class of bug**. The same map feeds the runtime `usePageMetadata`
hook (single source of truth). The same step also emits `sitemap.xml`, `robots.txt`
(allow public; disallow `/app`, `/api`; link the sitemap), and wires a real 1200×630
og-image with `twitter:card = summary_large_image` — co-delivering #1132. The build
script **validates the map and fails CI** if any public route lacks a title/description
or paths duplicate.

Serving works on both targets with no infra change: Vercel's filesystem precedence
serves the static `dist/<route>/index.html` ahead of the SPA catch-all rewrite, and
nginx's existing `try_files $uri $uri/ /index.html` resolves the per-route directory
index (verify both in the pilot).

## Alternatives considered

1. **React Router 7 framework mode** (`ssr:false` + `prerender` list, `@vercel/react-router`
   preset) — _rejected for now._ The official, future-proof path and gives full-body
   prerender, but migrating from declarative `<BrowserRouter><Routes>` to a `routes.ts`
   config plus `root.tsx`/`entry.client.tsx` entry files and data loaders across ~30
   routes is ~40–60h with med-high lock-in. Not justified by the marginal SEO gain for
   6 static pages. **This is the designated escape hatch** if full-body prerender is
   ever needed.
2. **vite-prerender-plugin (preactjs)** — _rejected._ Maintained, pure-JS (no Puppeteer),
   gives full-body prerender with no router change, but reintroduces React-19
   hydration-mismatch risk and ~2–3× the 12-month cost for content we don't yet need
   indexed.
3. **Vike** — _rejected._ Keeps declarative routes and does full SSR/SSG, but ~200 LOC
   glue + per-route config + hydration coordination is more machinery than the goal warrants.
4. **react-snap** — _rejected._ Abandoned (~2019, pre-hooks), unverified on React 19,
   Snyk vulns.
5. **Next.js 16 / TanStack Start / Astro** — _rejected._ Full-framework rewrites
   (2–4+ weeks), high lock-in; Astro additionally fights the SPA dashboard shape.
6. **Vercel Edge Middleware UA-sniff meta-injection** — _rejected._ Vercel-only (breaks
   homelab), fragile UA sniffing, doesn't solve per-route og-images.
7. **prerender.io SaaS** — _rejected._ $49+/mo, non-real-time scheduled crawl, high
   lock-in, serves bloated full HTML for a meta-only need.
8. **Status quo (client-only `usePageMetadata`)** — _rejected._ Fails #1131: JS-injected
   meta is invisible to non-JS crawlers.

## Consequences

**Positive**

- Satisfies #1131 (per-route meta in served HTML) and #1132 (robots/sitemap/og-image)
  in one low-risk build step; ~5–7× cheaper over 12 months than RR7 framework mode.
- Zero hydration-mismatch risk (body unrendered); zero infra lock-in; works on both
  Vercel and homelab nginx unchanged.
- Single metadata map removes server/client drift; build-time validation is a CI tripwire.

**Negative / accepted limits**

- Meta-only: page **body content** is NOT in the served HTML, so deep content
  indexing of `/docs`/`/features` (snippets in search/AI results) is **not** achieved —
  only title/description/OG. Acceptable because #1131/#1132 ask for metadata, and the
  primary use case is rich link previews (Discord/Twitter) + AI-crawler visibility of
  page identity.
- Manual coordination: editing `routeMeta.ts` requires a rebuild for served HTML to
  update (the runtime hook updates live; served HTML is build-time). Mitigated by the
  single source of truth + CI validation.

**Neutral**

- A small `scripts/prerender-seo.ts` (run via `tsx`; ~210 LOC) + one build-time devDep
  (`@resvg/resvg-js`, for the og-image) enter the repo; the metadata map becomes a soft
  contract any future prerender tool would consume.

## Revisit when

- A public route's **page CONTENT** must rank/appear (not just its meta) in Google or
  AI answer engines — e.g. `/docs` content needs to be a search result snippet, or a
  measured rank worse than ~position 20 for a target term → flip to **full-body
  prerender via RR7 framework mode** (alternative 1).
- The pilot shows Vercel's SPA rewrite winning over the static per-route file, or
  homelab `try_files` not resolving the per-route directory → revisit serving/output.
- `routeMeta.ts` exceeds ~500 LOC, or public-route count exceeds ~15 with rich content,
  or i18n ships per-language public routes → the map/axis outgrows a flat list; migrate
  to data loaders (RR7 framework mode).
- og-image generation (if Satori dynamic images are added later) pushes build time
  past ~60s, or hits a CVE/major-version break → defer images to a CDN/SaaS.
