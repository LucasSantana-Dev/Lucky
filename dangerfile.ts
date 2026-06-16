// Danger rules — deterministic PR checks that don't depend on AI bots.
// Runs in CI on every PR. Free, open source, no rate limits.
//
// Goal: enforce conventions that humans forget (and AI reviewers
// rate-limit out of) so the merge rule has more to lean on.

import { danger, fail, message, schedule, warn } from 'danger'

const pr = danger.github.pr
const modified = danger.git.modified_files
const created = danger.git.created_files
const all = [...modified, ...created]

// --- 1. PR size warning -----------------------------------------------------
// Big PRs are merge-risk — flag (don't fail) so reviewers slow down.
const bigPrLines = pr.additions + pr.deletions
if (bigPrLines > 800) {
    warn(
        `Big PR — **${bigPrLines}** lines changed across **${all.length}** files. ` +
            `Consider splitting into smaller, reviewable chunks.`,
    )
}

// --- 2. Source change without test change -----------------------------------
// Only enforce inside packages/bot, packages/backend, packages/frontend.
// Excludes pure type-only / config-only changes.
const sourceLikelyNeedingTest = (path: string): boolean =>
    /^packages\/(bot|backend|frontend)\/src\//.test(path) &&
    !path.endsWith('.d.ts') &&
    !/\.(spec|test)\.(ts|tsx|js)$/.test(path) &&
    !path.endsWith('index.ts')

const sourceChanges = all.filter(sourceLikelyNeedingTest)
const testChanges = all.filter((p) => /\.(spec|test)\.(ts|tsx)$/.test(p))

// Sum additions across only the source files (not the whole PR), so a big
// CHANGELOG / lockfile / docs change next to a one-line source tweak doesn't
// trigger the no-tests warning.
async function countSourceAdditions(): Promise<number> {
    if (sourceChanges.length === 0) return 0
    const diffs = await Promise.all(
        sourceChanges.map((f) => danger.git.diffForFile(f)),
    )
    return diffs.reduce((sum, d) => {
        if (!d?.added) return sum
        // Danger's TextDiff.added is the raw added content (no `+` prefix).
        // Count non-empty lines instead of filtering by leading `+`.
        return (
            sum + d.added.split('\n').filter((l) => l.trim().length > 0).length
        )
    }, 0)
}

// --- 3. CHANGELOG reminder for user-facing changes --------------------------
const changelogTouched = modified.includes('CHANGELOG.md')
const userFacingPatterns = [
    /^packages\/bot\/src\/functions\//,
    /^packages\/backend\/src\/routes\//,
    /^packages\/frontend\/src\//,
]
const userFacingChange = all.some((p) =>
    userFacingPatterns.some((rx) => rx.test(p)),
)
// Match conventional-commit prefixes with separator (colon, slash, parens)
// so titles like "refactoring auth" don't accidentally count as `refactor`.
// Narrowed to truly non-user-facing prefixes: only deps, ci, build, style, docs.
// Dropped: chore/test/refactor/perf — they often touch user-facing code.
const TITLE_PREFIX_SKIP =
    /^(chore\(deps(-dev)?\)|ci|build|style|docs)(\([^)]*\))?:\s/
const hasSkipLabel =
    pr.labels?.some((l: { name: string }) => l.name === 'skip-changelog') ??
    false
if (
    userFacingChange &&
    !changelogTouched &&
    !TITLE_PREFIX_SKIP.test(pr.title) &&
    !hasSkipLabel
) {
    warn(
        `User-facing change without a CHANGELOG.md update. ` +
            `Add a line under \`## [Unreleased]\` if this should appear in release notes. ` +
            `(Or apply the \`skip-changelog\` label if this PR does not affect end users.)`,
    )
}

// --- 4. Lockfile guard ------------------------------------------------------
// A package.json *dependency* change without a matching package-lock.json
// update usually means someone forgot to commit the resolved lockfile.
// Narrowed to fire ONLY when a dependency-bearing field actually changed:
// a script-/metadata-only edit (e.g. adding an npm script, bumping a private
// `version`) needs no lockfile churn and must not fail (false-positive on
// PR #1455, #1458). JSONDiffForFile keys only on CHANGED top-level fields —
// a field is absent from the diff when it didn't change.
const DEP_FIELDS = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
    'overrides',
] as const
// Cover both modified and newly-created lockfiles (first-time npm install case).
const lockChanged = all.some((p) => p === 'package-lock.json')
const changedPackageJsons = all.filter((p) => /(^|\/)package\.json$/.test(p))

async function checkLockfileGuard(): Promise<void> {
    if (changedPackageJsons.length === 0 || lockChanged) return
    for (const path of changedPackageJsons) {
        let depFieldChanged = false
        try {
            const diff = await danger.git.JSONDiffForFile(path)
            // A dependency field appears in the diff only when it changed.
            depFieldChanged = DEP_FIELDS.some((f) => Boolean(diff?.[f]))
        } catch {
            // If the diff can't be computed (e.g. malformed JSON), fall back
            // to the conservative guard rather than silently passing.
            depFieldChanged = true
        }
        if (depFieldChanged) {
            fail(
                `**\`${path}\` changed a dependency field but \`package-lock.json\` did not.** ` +
                    `Run \`npm install\` and commit the lockfile.`,
            )
            return
        }
    }
}

// --- 5. .env protection -----------------------------------------------------
// CLAUDE.md notes .env* is hooked-protected, but PRs can still slip
// through if the hook was bypassed locally. Belt and suspenders.
const envFiles = all.filter((p) => /(^|\/)\.env(\.|$)/.test(p))
if (envFiles.length > 0) {
    fail(
        `**.env* files in PR:** ${envFiles.join(', ')}. ` +
            `These should never be committed. If this is \`.env.example\`, ` +
            `it still needs explicit confirmation per project policy.`,
    )
}

// --- 6. Console.log left behind in source ----------------------------------
// Lucky uses structured logging via debugLog/infoLog/errorLog/warnLog.
// Bare console.log in src/ is almost always debug residue.
async function checkConsoleLogs(): Promise<void> {
    const sourceTouched = all.filter(
        (p) => /^packages\/.+\/src\//.test(p) && /\.(ts|tsx|js)$/.test(p),
    )
    for (const file of sourceTouched) {
        const diff = await danger.git.diffForFile(file)
        if (!diff) continue
        // Danger's TextDiff.added is the raw added content (no `+` prefix).
        const addedLines = diff.added
            .split('\n')
            .filter((l) => l.trim().length > 0)
            .filter((l) => /\bconsole\.(log|debug)\b/.test(l))
        if (addedLines.length > 0) {
            warn(
                `Possible debug residue in \`${file}\`: ${addedLines.length} \`console.log/debug\` ` +
                    `line(s) added. Use \`debugLog\` from \`@lucky/shared/utils\` for structured logging.`,
            )
        }
    }
}

// --- 7. Branch-prefix discipline -------------------------------------------
// Per workflow.md: feature/, fix/, refactor/, chore/, docs/, ci/, test/, release/
const headRef = danger.github.pr.head.ref
const validPrefixes =
    /^(feature|feat|fix|refactor|chore|docs|ci|test|release|hotfix|dependabot|perf|style)\//
if (!validPrefixes.test(headRef) && !headRef.startsWith('worktree-')) {
    warn(
        `Branch \`${headRef}\` doesn't follow the standard prefix convention ` +
            `(\`feature/\`, \`fix/\`, \`refactor/\`, \`chore/\`, \`docs/\`, \`ci/\`, \`test/\`, \`release/\`).`,
    )
}

// --- 9. Feature-removal sweep guard -----------------------------------------
// When a commit message indicates feature/route/model removal,
// flag if the PR body doesn't mention the sweep checklist.
const removalVerb = /\b(remove|delete|retire|drop|deprecate)\b/i
const removalTarget = /\b(route|handler|endpoint|model|toggle|feature)\b/i
const prBody = pr.body || ''
const hasSweepChecklistInBody = /feature-removal sweep/i.test(prBody)
const hasRemovalCommit = danger.git.commits.some(
    (c) => removalVerb.test(c.message) && removalTarget.test(c.message),
)

if (hasRemovalCommit && !hasSweepChecklistInBody) {
    const baseRepo = pr.base.repo.full_name
    const baseRef = pr.base.ref
    const adrPath = 'decisions/'
    const adrUrl = `https://github.com/${baseRepo}/blob/${baseRef}/${adrPath}`
    warn(
        `This PR appears to remove a feature or route (detected in commit message). ` +
            `Please fill in the **Feature-removal sweep** checklist in the PR template ` +
            `to ensure no orphan code (models, tests, types, imports) is left behind. ` +
            `[See ${adrPath}](${adrUrl}) for context.`,
    )
}

// --- 8. Big-file warning ----------------------------------------------------
// Files > 500 lines are review-hostile. Flag new ones.
async function checkLargeFiles(): Promise<void> {
    for (const file of created) {
        const lineCount = (await danger.git.structuredDiffForFile(file))?.chunks
            ?.flatMap((c) => c.changes)
            .filter((c) => c.type === 'add').length
        if (lineCount && lineCount > 500) {
            warn(
                `New file \`${file}\` is **${lineCount} lines** — consider splitting.`,
            )
        }
    }
}

// --- Async runner -----------------------------------------------------------
// Top-level await ensures Danger waits for these checks before exiting.
// Without this, fire-and-forget `void checkX()` calls could be cut off
// when the runtime tears down, silently dropping warnings.
async function runAsyncChecks(): Promise<void> {
    const sourceAdditions = await countSourceAdditions()
    if (
        sourceChanges.length > 0 &&
        testChanges.length === 0 &&
        sourceAdditions > 50
    ) {
        warn(
            `**No test changes** despite ${sourceChanges.length} source files modified ` +
                `(${sourceAdditions} source lines added). ` +
                `If this is intentional (e.g. refactor, build config), reply explaining why.`,
        )
    }

    await Promise.all([
        checkConsoleLogs(),
        checkLargeFiles(),
        checkLockfileGuard(),
    ])
}

// Hand the async work to Danger's scheduler. Danger awaits any promises
// registered via schedule() before exit. Using schedule() instead of a
// top-level await keeps the dangerfile CommonJS-loadable (Danger v12 uses
// require(), which rejects top-level await with ERR_REQUIRE_ASYNC_MODULE).
schedule(runAsyncChecks())
