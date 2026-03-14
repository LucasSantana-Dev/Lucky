import { execFileSync } from 'node:child_process'
import path from 'node:path'

const IMPACTED_PATHS = [
  /^packages\//,
  /^scripts\//,
  /^\.github\/workflows\//,
  /^docker-compose(?:\.[^/]+)?\.ya?ml$/,
  /^\.env\.example$/,
  /^opencode\.jsonc$/,
  /^AGENTS\.md$/,
  /^docs\//,
  /^\.opencode\//,
]

function git(cwd, ...args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function changedFiles(repoRoot) {
  const output = git(repoRoot, 'status', '--short')
  if (!output) return []
  return output
    .split(/\r?\n/)
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
}

function hasDocsTouch(files) {
  return files.includes('README.md') || files.includes('CHANGELOG.md')
}

function hasRelevantChanges(files) {
  return files.some((file) => IMPACTED_PATHS.some((pattern) => pattern.test(file)))
}

function isVerifyLike(command) {
  return /npm run (verify|test|build|lint|type:check)|vitest|jest|playwright|pnpm test|bun test/i.test(
    command,
  )
}

function isFailure(output) {
  const exitCode = Number(output.metadata?.exitCode ?? output.metadata?.code ?? 0)
  if (Number.isFinite(exitCode) && exitCode !== 0) return true
  return /error|failed/i.test(output.title || '')
}

function appendNote(output, note) {
  if ((output.output || '').includes(note)) return
  output.output = [output.output, note].filter(Boolean).join('\n\n')
}

export default async function luckyDocReminders(ctx) {
  const repoRoot = git(ctx.directory, 'rev-parse', '--show-toplevel') || path.resolve(ctx.directory)

  return {
    'tool.execute.after': async (input, output) => {
      const files = changedFiles(repoRoot)
      if (hasRelevantChanges(files) && !hasDocsTouch(files)) {
        appendNote(output, '[OpenCode reminder] README.md and CHANGELOG.md are still untouched.')
      }

      if (input.tool === 'bash' && isVerifyLike(input.args?.command || '') && isFailure(output)) {
        appendNote(
          output,
          '[OpenCode reminder] Record the failing command and error signature before moving on.',
        )
      }
    },
  }
}
