import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isSensitivePath,
  isDirectMainPush,
  isDestructiveShellCommand,
  shouldBlockRootMutation,
} from '../plugins/lucky-policy-lib.mjs'

const home = '/Users/tester'
const repoRoot = '/Users/tester/Desenvolvimento/Lucky'
const worktreeRoot = '/Users/tester/Desenvolvimento/Lucky/.worktrees/feature-x'

test('allows .env.example', () => {
  assert.equal(
    isSensitivePath('.env.example', { cwd: repoRoot, home, repoRoot }),
    false,
  )
})

test('denies .env', () => {
  assert.equal(
    isSensitivePath('.env', { cwd: repoRoot, home, repoRoot }),
    true,
  )
})

test('denies direct push to main', () => {
  assert.equal(isDirectMainPush('git push origin main'), true)
})

test('denies git reset --hard', () => {
  assert.equal(isDestructiveShellCommand('git reset --hard HEAD~1'), true)
})

test('denies root checkout mutation by default', () => {
  assert.equal(
    shouldBlockRootMutation({
      cwd: repoRoot,
      repoRoot,
      allowRootMutation: false,
      command: 'git add README.md',
    }),
    true,
  )
})

test('allows worktree mutation', () => {
  assert.equal(
    shouldBlockRootMutation({
      cwd: worktreeRoot,
      repoRoot: worktreeRoot,
      allowRootMutation: false,
      command: 'git add README.md',
    }),
    false,
  )
})
