import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

import {
  buildPolicyEnv,
  commandTouchesSensitivePath,
  isDestructiveShellCommand,
  isDirectMainPush,
  isSensitivePath,
  shouldBlockRootMutation,
} from './lucky-policy-lib.mjs'

function gitTopLevel(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
    }).trim()
  } catch {
    return path.resolve(cwd)
  }
}

function collectPathCandidates(value, key = '', result = []) {
  if (typeof value === 'string' && /file|path|dir|target|source|destination|cwd/i.test(key)) {
    result.push(value)
    return result
  }

  if (Array.isArray(value)) {
    for (const item of value) collectPathCandidates(item, key, result)
    return result
  }

  if (value && typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      collectPathCandidates(childValue, childKey, result)
    }
  }

  return result
}

function ensureSafeFileAccess(tool, args, context) {
  if (!args || tool === 'bash') return
  const candidates = collectPathCandidates(args)
  for (const candidate of candidates) {
    if (isSensitivePath(candidate, context)) {
      throw new Error(`Blocked access to sensitive path: ${candidate}`)
    }
  }

  if (!['write', 'edit'].includes(tool)) return
  const filePath = args.filePath || args.path
  if (!filePath) return
  const resolved = path.resolve(args.cwd || context.repoRoot, filePath)
  if (
    shouldBlockRootMutation({
      cwd: args.cwd || context.repoRoot,
      repoRoot: context.repoRoot,
      allowRootMutation: context.allowRootMutation,
      command: `touch ${resolved}`,
    })
  ) {
    throw new Error('Blocked mutating repo files from the Lucky root checkout. Use a worktree.')
  }
}

function ensureSafeShellCommand(command, cwd, context) {
  if (!command) return
  if (commandTouchesSensitivePath(command, context)) {
    throw new Error('Blocked shell command targeting sensitive files or auth stores.')
  }
  if (isDirectMainPush(command)) {
    throw new Error('Blocked direct push to main. Use a feature branch and PR.')
  }
  if (isDestructiveShellCommand(command)) {
    throw new Error('Blocked destructive shell command.')
  }
  if (
    shouldBlockRootMutation({
      cwd,
      repoRoot: context.repoRoot,
      allowRootMutation: context.allowRootMutation,
      command,
    })
  ) {
    throw new Error('Blocked mutating work from the Lucky root checkout. Use a worktree.')
  }
}

export default async function luckyPolicy(ctx) {
  const repoRoot = gitTopLevel(ctx.directory)
  const worktreeRoot = path.resolve(ctx.worktree || ctx.directory)
  const home = os.homedir()
  const allowRootMutation = process.env.LUCKY_ALLOW_ROOT_MUTATION === '1'
  const context = { allowRootMutation, cwd: ctx.directory, home, repoRoot, worktreeRoot }

  return {
    'command.execute.before': async (input) => {
      if (input.command === 'db') {
        ensureSafeShellCommand('npm run db:migrate', repoRoot, context)
      }
    },
    'tool.execute.before': async (input, output) => {
      const args = output.args || {}
      if (input.tool === 'bash') {
        ensureSafeShellCommand(args.command, args.cwd || repoRoot, context)
        return
      }
      ensureSafeFileAccess(input.tool, args, context)
    },
    'shell.env': async (_input, output) => {
      Object.assign(output.env, buildPolicyEnv({ cwd: ctx.directory, repoRoot, worktreeRoot }))
    },
  }
}
