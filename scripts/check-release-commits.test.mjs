import test from 'node:test'
import assert from 'node:assert/strict'
import { findDroppedCommits } from './check-release-commits.mjs'

// Stand-in for release-please: a message parses when its first line is a
// conventional title and no line contains the marker "BREAKS_PARSER". A PR
// body carrying an override replaces the message, as release-please does.
const countParsed = ({ message, pullRequest }) => {
    const override = pullRequest?.body.match(
        /BEGIN_COMMIT_OVERRIDE\n([\s\S]*?)\nEND_COMMIT_OVERRIDE/,
    )
    const text = override ? override[1] : message
    if (text.includes('BREAKS_PARSER')) return 0
    return /^(feat|fix|chore)(\(.+\))?: /.test(text) ? 1 : 0
}
const noBody = () => ''

test('a commit that parses is not reported', () => {
    const commits = [{ sha: 'a1', message: 'feat(bot): add x (#1)\n\nbody' }]
    assert.deepEqual(findDroppedCommits(commits, countParsed, noBody), [])
})

test('a conventional title with an unparseable body is reported', () => {
    const commits = [
        { sha: 'b2', message: 'feat(bot): add y (#2)\n\nBREAKS_PARSER' },
    ]
    assert.deepEqual(findDroppedCommits(commits, countParsed, noBody), [
        { sha: 'b2', title: 'feat(bot): add y (#2)' },
    ])
})

test('a non-conventional title is skipped by design, not reported', () => {
    const commits = [{ sha: 'c3', message: 'Merge branch main\n\nwhatever' }]
    assert.deepEqual(findDroppedCommits(commits, countParsed, noBody), [])
})

test('an override in the PR body clears the report', () => {
    const commits = [
        { sha: 'd4', message: 'feat(bot): add z (#4)\n\nBREAKS_PARSER' },
    ]
    const body =
        'text\nBEGIN_COMMIT_OVERRIDE\nfeat(bot): add z (#4)\nEND_COMMIT_OVERRIDE'
    assert.deepEqual(
        findDroppedCommits(commits, countParsed, () => body),
        [],
    )
})

test('the PR body is only fetched for commits that failed to parse', () => {
    const asked = []
    const commits = [
        { sha: 'e5', message: 'fix: ok (#5)' },
        { sha: 'f6', message: 'fix: bad (#6)\n\nBREAKS_PARSER' },
    ]
    findDroppedCommits(commits, countParsed, (sha) => {
        asked.push(sha)
        return ''
    })
    assert.deepEqual(asked, ['f6'])
})
