import os from 'node:os'
import path from 'node:path'

const DESTRUCTIVE_COMMAND_PATTERNS = [
  /(^|[;&|]\s*)git\s+reset\s+--hard(?:\s|$)/i,
  /(^|[;&|]\s*)git\s+checkout\s+--(?:\s|$)/i,
  /(^|[;&|]\s*)git\s+clean\s+-[^\n;&|]*f[^\n;&|]*d[^\n;&|]*(?:x|X)?/i,
  /(^|[;&|]\s*)rm\s+-rf\s+\/(?:\s|$)/i,
  /(^|[;&|]\s*)mkfs(?:\.[^\s]+)?(?:\s|$)/i,
  /(^|[;&|]\s*)dd\s+[^\n]*\bof=\/dev\//i,
]

const MUTATING_COMMAND_PATTERNS = [
  /(^|[;&|]\s*)git\s+(add|am|apply|branch|checkout|cherry-pick|clean|commit|merge|mv|rebase|reset|restore|rm|stash|switch|tag)(?:\s|$)/i,
  /(^|[;&|]\s*)(bun\s+add|npm\s+(install|update)|pnpm\s+(add|install|update)|yarn\s+(add|install|upgrade))(?:\s|$)/i,
  /(^|[;&|]\s*)(cp|install|ln|mkdir|mv|rm|rmdir|sed\s+-i|tee|touch)(?:\s|$)/i,
]

const DIRECT_MAIN_PUSH_PATTERNS = [
  /^git\s+push(?:\s+--\S+|\s+-\S+)*\s+(?:(?:origin|upstream)\s+)?(?:refs\/heads\/)?main(?:\s|$)/i,
  /^git\s+push(?:\s+--\S+|\s+-\S+)*\s+(?:origin|upstream)\s+HEAD:(?:refs\/heads\/)?main(?:\s|$)/i,
]

function expandHome(value, home) {
  if (!value) return value
  if (value === '~') return home
  if (value.startsWith('~/')) return path.join(home, value.slice(2))
  return value
}

function resolveTarget(rawPath, { cwd = process.cwd(), home = os.homedir() } = {}) {
  if (!rawPath || typeof rawPath !== 'string') return null
  const trimmed = rawPath.trim()
  if (!trimmed) return null
  const expanded = expandHome(trimmed, home)
  return path.resolve(cwd, expanded)
}

function isEnvFile(resolvedPath, repoRoot) {
  const basename = path.basename(resolvedPath)
  if (basename === '.env.example') return false
  if (basename === '.env') return true
  if (basename.startsWith('.env.')) return true
  if (repoRoot && resolvedPath === path.resolve(repoRoot, '.cursor/.env.mcp')) return true
  return false
}

function isInside(candidate, targetRoot) {
  const normalizedRoot = path.resolve(targetRoot)
  const normalizedCandidate = path.resolve(candidate)
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(normalizedRoot + path.sep)
  )
}

export function isSensitivePath(
  rawPath,
  { cwd = process.cwd(), home = os.homedir(), repoRoot } = {},
) {
  const resolvedPath = resolveTarget(rawPath, { cwd, home })
  if (!resolvedPath) return false
  if (repoRoot && resolvedPath === path.resolve(repoRoot, '.env.example')) return false
  if (isEnvFile(resolvedPath, repoRoot)) return true
  if (isInside(resolvedPath, path.join(home, '.ssh'))) return true
  if (isInside(resolvedPath, path.join(home, '.aws'))) return true
  if (resolvedPath === path.join(home, '.config', 'fish', 'config.fish')) return true
  if (resolvedPath === path.join(home, '.local', 'share', 'opencode', 'auth.json')) return true
  if (isInside(resolvedPath, path.join(home, '.config', 'opencode', 'auth'))) return true
  return false
}

export function commandTouchesSensitivePath(
  command,
  { cwd = process.cwd(), home = os.homedir(), repoRoot } = {},
) {
  if (!command || typeof command !== 'string') return false
  const candidates = [
    '.env',
    '.cursor/.env.mcp',
    '~/.ssh/',
    '~/.aws/',
    '~/.config/fish/config.fish',
    '~/.local/share/opencode/auth.json',
    `${repoRoot ?? ''}/.env`,
    `${repoRoot ?? ''}/.cursor/.env.mcp`,
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (command.includes(candidate) && !command.includes('.env.example')) {
      return true
    }
  }

  return false
}

export function isDirectMainPush(command) {
  if (!command || typeof command !== 'string') return false
  const normalized = command.trim().replace(/\s+/g, ' ')
  return DIRECT_MAIN_PUSH_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function isDestructiveShellCommand(command) {
  if (!command || typeof command !== 'string') return false
  return DESTRUCTIVE_COMMAND_PATTERNS.some((pattern) => pattern.test(command))
}

export function isMutatingShellCommand(command) {
  if (!command || typeof command !== 'string') return false
  if (isDirectMainPush(command) || isDestructiveShellCommand(command)) return true
  return MUTATING_COMMAND_PATTERNS.some((pattern) => pattern.test(command))
}

export function isPrimaryCheckout(repoRoot) {
  return !path.resolve(repoRoot).split(path.sep).includes('.worktrees')
}

export function shouldBlockRootMutation({
  cwd = process.cwd(),
  repoRoot,
  allowRootMutation = false,
  command,
}) {
  if (!repoRoot || allowRootMutation) return false
  if (!isPrimaryCheckout(repoRoot)) return false
  if (!isMutatingShellCommand(command)) return false
  const normalizedRoot = path.resolve(repoRoot)
  const normalizedCwd = path.resolve(cwd)
  return (
    normalizedCwd === normalizedRoot ||
    normalizedCwd.startsWith(normalizedRoot + path.sep)
  )
}

export function buildPolicyEnv({ cwd = process.cwd(), repoRoot, worktreeRoot }) {
  const resolvedRepoRoot = repoRoot ? path.resolve(repoRoot) : process.cwd()
  const resolvedWorktreeRoot = path.resolve(worktreeRoot || cwd)
  return {
    OPENCODE_GIT_REPOSITORY: resolvedRepoRoot,
    OPENCODE_SERENA_PROJECT: resolvedWorktreeRoot,
    LUCKY_WORKTREE_ROOT: resolvedWorktreeRoot,
  }
}
