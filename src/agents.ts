import { accessSync, constants } from 'node:fs'
import { join } from 'node:path'
import { UserError } from './errors.ts'
import type { AgentId } from './store.ts'

// Claude sessions start pinned to Opus 5.5 (full id, so the `opus` alias moving on does not change it) in auto mode.
const BIN: Record<AgentId, string[]> = {
  claude: ['claude', '--model', 'claude-opus-5-5', '--permission-mode', 'auto'],
  codex: ['codex'],
  kiro: ['kiro-cli', 'chat'],
}

/**
 * Interactive command line per agent. Each starts in the task dir, which holds one worktree
 * per repo as a subfolder, so every repo is already inside the agent's workspace: no per-CLI
 * "add directory" flag needed (codex does not even have one).
 */
export const agentArgv = (agent: AgentId): string[] => BIN[agent]

/**
 * Brings an exited agent back with its conversation, started in the same task dir. Claude's `--continue` and
 * Kiro's `--resume` pick the latest conversation in the current folder, which is this task's alone. Codex's
 * `--last` is not scoped to the folder, so it gets the picker instead of risking another project's session.
 */
const RESUME: Record<AgentId, string[]> = {
  claude: [...BIN.claude, '--continue'],
  codex: ['codex', 'resume'],
  kiro: [...BIN.kiro, '--resume'],
}
export const resumeArgv = (agent: AgentId): string[] => RESUME[agent]

/**
 * PATH lookup to an absolute binary, so tmux's server (which may have a stale PATH) and ConPTY both
 * get an exact file. On Windows a bare name is really `name.exe` / `name.cmd`, so PATHEXT is tried too.
 */
export function resolveBin(argv: string[], env: NodeJS.ProcessEnv = process.env, platform = process.platform): string[] {
  const [bin, ...rest] = argv
  const win = platform === 'win32'
  const exts = win ? ['', ...(env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)] : ['']
  for (const dir of (env.PATH ?? env.Path ?? '').split(win ? ';' : ':').filter(Boolean)) {
    for (const ext of exts) {
      try {
        const full = join(dir, bin! + ext)
        // Windows has no execute bit: there "launchable" means the file exists with a launchable extension.
        accessSync(full, win ? constants.F_OK : constants.X_OK)
        if (win && ext === '' && !/\.(exe|com|cmd|bat)$/i.test(full)) continue // an extensionless file (npm's sh shim) cannot be launched
        return [full, ...rest]
      } catch {
        /* keep looking */
      }
    }
  }
  throw new UserError(`${bin} is not installed or not on PATH`)
}

/** A `.cmd`/`.bat` shim (how npm installs CLIs on Windows) is a cmd.exe script, not an executable: run it through cmd. */
export function launchArgv(argv: string[], platform = process.platform, comspec = process.env.ComSpec): string[] {
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(argv[0] ?? '')) return [comspec ?? 'cmd.exe', '/d', '/c', ...argv]
  return argv
}
