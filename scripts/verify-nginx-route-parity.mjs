import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Verifies that every backend route registered OUTSIDE `/api` has a matching
// `location` block in nginx/nginx.conf. That is the class of bug where the two
// sides disagree and the edge silently drops the path.
//
// `nginx -t` (ci.yml, "Validate nginx config") is a SYNTAX check: a config that
// parses perfectly and routes nothing passes it. Nothing asserted reachability
// until this gate.
//
// Shipped twice, silent both times:
//   #1888  /invite               -> fell through to the SPA catch-all, which bounces
//                                  unknown paths to the landing page. Every invite
//                                  click swallowed. Fixed by `location = /invite`.
//   #2086  /webhooks/topgg-votes -> fell through to `location /`, whose static
//                                  server answers POST with an nginx HTML 405. Every
//                                  top.gg vote callback dropped. Fixed by #2089.
//
// The failure mode is silent by construction: the SPA answers GET with 200 +
// HTML, so `curl -o /dev/null -w "%{http_code}"` against a dead path prints 200
// and tells you nothing. Only content-type or a non-GET method gives it away.

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

const ROUTES_DIR = path.join(repoRoot, 'packages/backend/src/routes')
const BACKEND_SRC = path.join(repoRoot, 'packages/backend/src')
const NGINX_CONF = path.join(repoRoot, 'nginx/nginx.conf')

// Root-level routes intentionally NOT reachable from the edge. Each entry must
// name why: "add it to the allowlist" is the easy wrong fix for a route that
// genuinely needs a location block. Entries are checked for staleness below.
const NOT_EDGE_EXPOSED = new Map([
    [
        '/metrics',
        'Prometheus scrape target. packages/backend/src/routes/metrics.ts documents it as ' +
            'unauthenticated and restricted at the network layer (Docker network / ingress ' +
            'allowlist). The ABSENCE of an nginx location is the control keeping it off the ' +
            'public edge. Adding one would expose runtime metrics to anyone.',
    ],
])

// Canary: routes this gate MUST rediscover on every run. Both incidents it
// exists for are here, and they deliberately cover BOTH registration shapes.
// `/invite` is single-line, `/webhooks/topgg-votes` puts the path on the next
// line. A parser that finds both is handling both shapes; a parser that
// degrades (e.g. loses newline spanning) drops one and fails here.
//
// This exists because `registrations > 0` is NOT enough: a single-line-only
// regex still matched 12 of 145 registrations and passed green while silently
// losing /webhooks/topgg-votes. Partial degradation needs a named expectation,
// not a floor. Removing a route legitimately means updating this list on
// purpose, same discipline as the allowlist below.
const MUST_DISCOVER = ['/invite', '/webhooks/topgg-votes']

// `app.get('/x', …)` plus the multi-line form where the path sits on the next
// line. `\s*` spans newlines, so both shapes match. Getting this wrong is the
// trap this gate exists to avoid: a single-line-only regex finds ZERO of the
// multi-line registrations and the check passes vacuously.
const ROUTE_RE =
    /\bapp\.(?:get|post|put|patch|delete|head|options|all|use)\(\s*(?:(['"`])([^'"`]+)\1|([A-Za-z_$][\w$]*))/g

// A path extracted into a constant (`app.post(TOPGG_WEBHOOK_PATH, …)`) is
// invisible to a literal-only scan. That is not hypothetical: #2103 moved the
// top.gg webhook path into a shared constant so the route and the raw-body
// capture hook could not drift, and this gate went red on the canary below --
// working exactly as intended, but the right answer is to resolve the constant
// rather than to forbid the pattern.
//
// Resolution is deliberately shallow: match `const NAME = '/literal'` anywhere
// under the backend source and key it by name, with no import graph. An
// identifier that does not resolve is treated as middleware (`app.use(cors)`,
// `app.use(express.json(...))`) and skipped -- which is why the MUST_DISCOVER
// canary, not this resolver, remains the thing that makes a degraded scan loud.
const PATH_CONST_RE =
    /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*(['"`])(\/[^'"`]*)\2/g

// `location /x {`, `location = /x {`, `location ^~ /x {`, `location ~ ^/x {`.
const LOCATION_RE = /^[ \t]*location\s+(?:(=|~\*?|\^~)\s+)?(\S+)\s*\{/gm

// Recurses. packages/backend/src/routes/music/ already holds 5 files with route
// registrations, and a top-level-only scan silently skipped all of them. A
// non-/api route added under any such subdirectory would have been invisible
// and the gate would have passed green while the path fell through.
async function collectRouteFiles(dir) {
    let entries
    try {
        entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(
            `Unable to read route dir "${path.relative(repoRoot, dir)}": ${message}. ` +
                'If the routes moved, update ROUTES_DIR. A missing dir must fail loudly, ' +
                'not pass green with zero coverage.',
            { cause: error },
        )
    }

    const nested = await Promise.all(
        entries.map(async (entry) => {
            const entryPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                if (
                    entry.name === '__tests__' ||
                    entry.name === 'node_modules'
                ) {
                    return []
                }
                return collectRouteFiles(entryPath)
            }
            return entry.isFile() && entry.name.endsWith('.ts')
                ? [entryPath]
                : []
        }),
    )
    return nested.flat()
}

/**
 * name -> path, for every `const NAME = '/literal'` under the backend source.
 * A name bound to two different paths is dropped: guessing which one a route
 * meant is exactly the silent-wrong-answer this gate exists to prevent.
 */
async function collectPathConstants() {
    const files = await collectRouteFiles(BACKEND_SRC)
    const seen = new Map()

    for (const filePath of files) {
        const content = await readFile(filePath, 'utf8')
        for (const match of content.matchAll(PATH_CONST_RE)) {
            const [, name, , value] = match
            if (!seen.has(name)) seen.set(name, new Set())
            seen.get(name).add(value)
        }
    }

    const resolved = new Map()
    const ambiguous = []
    for (const [name, values] of seen) {
        if (values.size === 1) resolved.set(name, [...values][0])
        else ambiguous.push(`${name} -> ${[...values].join(', ')}`)
    }

    return { resolved, ambiguous }
}

async function collectRootRoutes() {
    const files = await collectRouteFiles(ROUTES_DIR)
    const { resolved: pathConstants, ambiguous } = await collectPathConstants()

    const routes = new Map()
    let registrations = 0

    for (const filePath of files) {
        const content = await readFile(filePath, 'utf8')
        for (const match of content.matchAll(ROUTE_RE)) {
            registrations += 1
            // match[2] is a string literal, match[3] a bare identifier.
            const routePath = match[2] ?? pathConstants.get(match[3])
            if (!routePath) continue
            if (!routePath.startsWith('/')) continue
            // `/api` is covered by `location /api` by construction.
            if (routePath === '/api' || routePath.startsWith('/api/')) continue
            // Wildcard / param catch-alls are not discrete edge paths.
            if (/[*{]/.test(routePath)) continue

            const rel = path.relative(repoRoot, filePath)
            if (!routes.has(routePath)) routes.set(routePath, new Set())
            routes.get(routePath).add(rel)
        }
    }

    return { routes, files, registrations, ambiguous }
}

async function collectLocations() {
    const content = await readFile(NGINX_CONF, 'utf8')
    return [...content.matchAll(LOCATION_RE)].map((match) => ({
        modifier: match[1] ?? '',
        prefix: match[2],
    }))
}

// `location /` is the SPA catch-all. It matches everything, which is exactly
// what "fell through to the SPA" means, so it must never count as coverage.
const isCatchAll = (loc) => loc.modifier === '' && loc.prefix === '/'

// An Express `:param` never reaches the edge in template form: the client sends
// `/foo/123`, not `/foo/:id`. So a naive string compare can call a route covered
// while real requests fall through to `location /`, which is the exact wrong
// answer this gate exists to prevent. Two rules follow:
//   - an nginx prefix containing `:` is a LITERAL path segment and can never
//     match a filled-in value, so it never counts as coverage
//   - an `=` (exact) block can never cover a route that has a param
// Prefix coverage of a param route is still valid when the prefix stops at or
// before the first param segment: `location /foo/` does cover `/foo/:id`.
function findCoveringLocation(routePath, locations) {
    const staticPart = `${routePath.split('/:')[0]}/`
    for (const loc of locations) {
        if (isCatchAll(loc)) continue
        if (loc.prefix.includes(':')) continue
        if (loc.modifier === '=') {
            if (!routePath.includes(':') && loc.prefix === routePath) return loc
            continue
        }
        if (loc.modifier === '' || loc.modifier === '^~') {
            if (
                routePath.startsWith(loc.prefix) &&
                loc.prefix.length <= staticPart.length
            ) {
                return loc
            }
        }
        // `~` / `~*` regex locations are not evaluated. See the guard below.
    }
    return null
}

const failures = []
let routes = new Map()
let locations = []
let ambiguousConstants = []
let files = []
let registrations = 0

try {
    const scan = await collectRootRoutes()
    routes = scan.routes
    files = scan.files
    registrations = scan.registrations
    ambiguousConstants = scan.ambiguous
    locations = await collectLocations()
} catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failures.push(`scan: ${message}`)
}

// --- Vacuous-pass guards -------------------------------------------------
// Every check below exists because a broken parser produces an EMPTY result
// set, and an empty result set trivially satisfies "no uncovered routes".
// A green run must mean "we looked and found nothing wrong", never "we
// failed to look".
if (failures.length === 0) {
    if (files.length === 0) {
        failures.push(
            `no .ts files found in ${path.relative(repoRoot, ROUTES_DIR)}: the scan matched nothing`,
        )
    }
    if (registrations === 0) {
        failures.push(
            'ROUTE_RE matched zero app.<verb>(...) registrations across the route files. ' +
                'the pattern is broken (registrations exist) and this gate would pass vacuously',
        )
    }
    if (locations.length === 0) {
        failures.push(
            `LOCATION_RE matched zero location blocks in ${path.relative(repoRoot, NGINX_CONF)}. ` +
                'the pattern is broken and every route would look uncovered',
        )
    }
    if (locations.length > 0 && !locations.some(isCatchAll)) {
        failures.push(
            `no catch-all "location /" found in ${path.relative(repoRoot, NGINX_CONF)}. ` +
                'the SPA fall-through this gate reasons about no longer exists as assumed; ' +
                're-read the config before trusting this result',
        )
    }
    for (const loc of locations) {
        if (loc.modifier === '~' || loc.modifier === '~*') {
            failures.push(
                `regex location "${loc.modifier} ${loc.prefix}" is not evaluated by this gate. ` +
                    'add explicit support before relying on it to cover a root-level route',
            )
        }
    }
    for (const entry of ambiguousConstants) {
        failures.push(
            `path constant "${entry}" is bound to more than one value, so a route using it ` +
                'cannot be resolved and was skipped. Give the constants distinct names, or ' +
                'this gate silently stops covering that route.',
        )
    }
    for (const expected of MUST_DISCOVER) {
        if (!routes.has(expected)) {
            failures.push(
                `expected root-level route "${expected}" was NOT discovered by the scan. ` +
                    'either the route was removed (update MUST_DISCOVER on purpose) or ROUTE_RE ' +
                    'has degraded and is silently missing registrations. Do NOT trust a pass ' +
                    'from this run.',
            )
        }
    }
    for (const allowed of NOT_EDGE_EXPOSED.keys()) {
        if (!routes.has(allowed)) {
            failures.push(
                `allowlist entry "${allowed}" matches no registered route. It was renamed or ` +
                    'removed. Drop the stale entry so the allowlist cannot hide a future route.',
            )
        }
    }
}

// --- Parity ---------------------------------------------------------------
const uncovered = []
const allowlisted = []
const covered = []

if (failures.length === 0) {
    for (const [routePath, sources] of [...routes].sort()) {
        const location = findCoveringLocation(routePath, locations)
        if (location) {
            covered.push({ routePath, location })
        } else if (NOT_EDGE_EXPOSED.has(routePath)) {
            allowlisted.push(routePath)
        } else {
            uncovered.push({ routePath, sources: [...sources].sort() })
        }
    }

    // An allowlisted route that GAINED a location block is also drift: the
    // documented reason ("deliberately not exposed") no longer describes the
    // config, and for /metrics that specific drift is a security regression.
    for (const { routePath, location } of covered) {
        if (NOT_EDGE_EXPOSED.has(routePath)) {
            const shown = `${location.modifier} ${location.prefix}`.trim()
            failures.push(
                `"${routePath}" is allowlisted as NOT edge-exposed but nginx.conf now routes it ` +
                    `via "location ${shown}". Either remove the allowlist entry or remove the ` +
                    'location block. Reason on record: ' +
                    NOT_EDGE_EXPOSED.get(routePath),
            )
        }
    }
}

if (failures.length > 0 || uncovered.length > 0) {
    console.error('nginx route parity check FAILED\n')

    for (const failure of failures) console.error(`- ${failure}`)

    if (uncovered.length > 0) {
        console.error(
            `- ${uncovered.length} root-level backend route(s) have no nginx location:`,
        )
        for (const { routePath, sources } of uncovered) {
            console.error(`    ${routePath}   (${sources.join(', ')})`)
        }
        console.error(
            '\n  These fall through to `location /`, the SPA. GET returns 200 with HTML and ' +
                'looks healthy;\n  POST returns an nginx HTML 405. Same silent failure as #1888 ' +
                'and #2086.\n\n' +
                '  Fix ONE of:\n' +
                '    a) add a `location` block in nginx/nginx.conf proxying to $backend_upstream\n' +
                '    b) move the route under /api, which `location /api` already covers\n' +
                '    c) if it must NOT be reachable from the edge, add it to NOT_EDGE_EXPOSED\n' +
                '       in this script WITH the reason why',
        )
    }

    process.exit(1)
}

const summary = [
    `${covered.length} covered`,
    `${allowlisted.length} allowlisted`,
]
console.log(
    `nginx route parity check passed (${routes.size} root-level route(s): ${summary.join(', ')}; ` +
        `scanned ${registrations} registrations across ${files.length} route files against ` +
        `${locations.length} location blocks).`,
)
for (const { routePath, location } of covered) {
    const shown = `${location.modifier} ${location.prefix}`.trim()
    console.log(`  ${routePath}  ->  location ${shown}`)
}
for (const routePath of allowlisted) {
    console.log(`  ${routePath}  ->  allowlisted, not edge-exposed`)
}
