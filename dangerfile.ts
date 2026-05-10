// Danger rules — deterministic PR checks that don't depend on AI bots.
// Runs in CI on every PR. Free, open source, no rate limits.
//
// Goal: enforce conventions that humans forget (and AI reviewers
// rate-limit out of) so the merge rule has more to lean on.

import { danger, fail, message, warn } from 'danger'

const pr = danger.github.pr
const files = danger.git
const modified = files.modified_files
const created = files.created_files
const deleted = files.deleted_files
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

if (sourceChanges.length > 0 && testChanges.length === 0 && pr.additions > 50) {
    warn(
        `**No test changes** despite ${sourceChanges.length} source files modified. ` +
            `If this is intentional (e.g. refactor, build config), reply explaining why.`,
    )
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
if (
    userFacingChange &&
    !changelogTouched &&
    !pr.title.startsWith('chore') &&
    !pr.title.startsWith('test') &&
    !pr.title.startsWith('docs') &&
    !pr.title.startsWith('refactor')
) {
    message(
        `User-facing change without a CHANGELOG.md update. ` +
            `Add a line under \`## [Unreleased]\` if this should appear in release notes.`,
    )
}

// --- 4. Lockfile guard ------------------------------------------------------
// package.json without package-lock.json (or vice versa) usually means
// someone forgot to commit one half of a dependency change.
const packageJsonChanged = modified.some((p) => /(^|\/)package\.json$/.test(p))
const lockChanged = modified.some((p) => p === 'package-lock.json')
if (packageJsonChanged && !lockChanged) {
    fail(
        `**\`package.json\` changed but \`package-lock.json\` did not.** ` +
            `Run \`npm install\` and commit the lockfile.`,
    )
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
async function checkConsoleLogs() {
    const sourceTouched = all.filter(
        (p) => /^packages\/.+\/src\//.test(p) && /\.(ts|tsx|js)$/.test(p),
    )
    for (const file of sourceTouched) {
        const diff = await danger.git.diffForFile(file)
        if (!diff) continue
        const addedLines = diff.added
            .split('\n')
            .filter((l) => l.startsWith('+'))
            .filter((l) => /\bconsole\.(log|debug)\b/.test(l))
        if (addedLines.length > 0) {
            warn(
                `Possible debug residue in \`${file}\`: ${addedLines.length} \`console.log/debug\` ` +
                    `line(s) added. Use \`debugLog\` from \`@lucky/shared/utils\` for structured logging.`,
            )
        }
    }
}
void checkConsoleLogs()

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

// --- 8. Big-file warning ----------------------------------------------------
// Files > 500 lines are review-hostile. Flag new ones.
async function checkLargeFiles() {
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
void checkLargeFiles()
