#!/usr/bin/env node
// Fails when release-please would silently drop a commit from the next
// release (#2710).
//
// A squash commit is the PR title plus the PR body. release-please parses the
// whole message as a conventional commit, and a body line that looks like a
// malformed footer makes the parser throw. release-please then logs
// "commit could not be parsed" and skips the commit, with a green workflow:
// the feat or fix is missing from the changelog and the version bump can be
// too small (a feat dropped turned 2.54.0 into 2.53.1).
//
// This re-runs the same parser (the release-please version the action
// bundles) over the commits since the last release and fails for each commit
// whose title is a valid conventional commit but whose full message yields
// nothing. Commits with a non-conventional title are ignored on purpose:
// release-please skips those by design.
//
// Usage: REPO=owner/name RELEASE_PLEASE_DIR=/path/with/node_modules \
//        node scripts/check-release-commits.mjs
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const OVERRIDE_HINT = [
    'Fix: add this block to the description of the merged PR, then rerun this workflow:',
    '',
    'BEGIN_COMMIT_OVERRIDE',
    '<the PR title, e.g. feat(bot): add the thing (#1234)>',
    'END_COMMIT_OVERRIDE',
].join('\n')

const titleOf = (message) => message.split('\n', 1)[0]

/**
 * @param {{sha: string, message: string}[]} commits
 * @param {(commit: {sha: string, message: string, pullRequest?: {body: string}}) => number} countParsed
 *   how many conventional commits release-please extracts from one commit
 * @param {(sha: string) => string} prBodyOf body of the PR that produced the commit
 * @returns {{sha: string, title: string}[]} commits release-please would drop
 */
export function findDroppedCommits(commits, countParsed, prBodyOf) {
    const dropped = []
    for (const commit of commits) {
        if (countParsed(commit) > 0) continue
        const title = titleOf(commit.message)
        // Non-conventional title: skipped by design, not a silent drop.
        if (countParsed({ sha: commit.sha, message: title }) === 0) continue
        // A BEGIN_COMMIT_OVERRIDE block in the PR body replaces the message.
        const body = prBodyOf(commit.sha)
        if (body && countParsed({ ...commit, pullRequest: { body } }) > 0)
            continue
        dropped.push({ sha: commit.sha, title })
    }
    return dropped
}

function gh(args) {
    return execFileSync('gh', args, {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    })
}

function main() {
    const repo = process.env.REPO
    const rpDir = process.env.RELEASE_PLEASE_DIR
    if (!repo || !rpDir) {
        console.error('REPO and RELEASE_PLEASE_DIR are required')
        process.exit(2)
    }
    const require = createRequire(join(rpDir, 'noop.js'))
    const {
        parseConventionalCommits,
    } = require('release-please/build/src/commit')
    const quiet = { error() {}, warn() {}, info() {}, debug() {}, trace() {} }
    const countParsed = (commit) =>
        parseConventionalCommits([{ files: [], ...commit }], quiet).length

    const tag = gh([
        'api',
        `repos/${repo}/releases/latest`,
        '--jq',
        '.tag_name',
    ]).trim()
    // The compare API returns at most 250 commits. A release batch is far
    // smaller, so a capped response fails loudly instead of being paginated.
    const { total, commits } = JSON.parse(
        gh([
            'api',
            `repos/${repo}/compare/${tag}...main`,
            '--jq',
            '{total: .total_commits, commits: [.commits[] | {sha, message: .commit.message}]}',
        ]),
    )
    if (total > commits.length) {
        console.log(
            `::error::${total} commits since ${tag}, but the compare API returned ${commits.length}. The check cannot cover the whole range.`,
        )
        process.exit(1)
    }
    const prBodyOf = (sha) =>
        gh([
            'api',
            `repos/${repo}/commits/${sha}/pulls`,
            '--jq',
            '.[0].body // ""',
        ])

    const dropped = findDroppedCommits(commits, countParsed, prBodyOf)
    console.log(`Checked ${commits.length} commits since ${tag}.`)
    if (dropped.length === 0) {
        console.log('release-please can parse all of them.')
        return
    }
    for (const { sha, title } of dropped) {
        console.log(
            `::error::release-please cannot parse ${sha.slice(0, 8)} "${title}" and will leave it out of the next release.`,
        )
    }
    console.log(OVERRIDE_HINT)
    process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
