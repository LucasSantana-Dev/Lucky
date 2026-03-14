import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

function git(cwd, ...args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function readSnippet(filePath, maxLines = 8) {
  try {
    return fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(0, maxLines)
      .join('\n')
  } catch {
    return ''
  }
}

export default async function luckyContext(ctx) {
  const repoRoot = git(ctx.directory, 'rev-parse', '--show-toplevel') || path.resolve(ctx.directory)
  const branch = git(repoRoot, 'branch', '--show-current') || 'unknown'
  const worktreeRoot = path.resolve(ctx.worktree || ctx.directory)
  const currentState = readSnippet(path.join(repoRoot, '.serena/memories/current-state.md'))
  const nextPriorities = readSnippet(path.join(repoRoot, '.serena/memories/next-priorities.md'))

  return {
    'experimental.chat.system.transform': async (_input, output) => {
      output.system.push(
        [
          'Lucky bootstrap:',
          '- Read AGENTS.md before acting.',
          '- Read .serena/memories/current-state.md and .serena/memories/next-priorities.md.',
          '- Prefer isolated worktrees over the primary checkout.',
          '- Use PR-only workflow; never push directly to main.',
          '- Update README.md and CHANGELOG.md for behavior or setup changes.',
          '- Run verification before completion and record failing commands exactly.',
        ].join('\n'),
      )
    },
    'experimental.session.compacting': async (_input, output) => {
      const changedFiles = git(repoRoot, 'status', '--short') || 'clean'
      output.context.push(
        [
          `Branch: ${branch}`,
          `Worktree: ${worktreeRoot}`,
          `Repository: ${repoRoot}`,
          currentState ? `Current state:\n${currentState}` : '',
          nextPriorities ? `Next priorities:\n${nextPriorities}` : '',
          `Changed files:\n${changedFiles}`,
          'Preserve unresolved verification failures with exact command lines and error signatures.',
        ]
          .filter(Boolean)
          .join('\n\n'),
      )
    },
  }
}
