import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import crossSpawn from 'cross-spawn'

const exec = promisify(execFile)

// execFile, never a shell: arguments are passed as an argv array so user input cannot be interpreted as shell syntax.
export async function run(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await exec(cmd, args, { maxBuffer: 10 * 1024 * 1024 })
  return stdout
}

export const git = (repo: string, ...args: string[]) => run('git', ['-C', repo, ...args])

export type Captured = { code: number | null; stdout: string; stderr: string; timedOut: boolean }

/**
 * Runs a command to completion and reports its exit code instead of throwing: tools like `pnpm outdated` exit 1 on a normal result.
 * cross-spawn, not child_process.spawn: on Windows `pnpm`, `npm` and npm-installed CLIs are `.cmd` shims, which Node
 * refuses to spawn without a shell; cross-spawn finds them via PATHEXT and escapes the arguments for cmd.exe.
 */
export function runCapture(
  cmd: string,
  args: string[],
  opts: { cwd?: string; input?: string; timeoutMs: number; env?: NodeJS.ProcessEnv },
): Promise<Captured> {
  return new Promise((resolve) => {
    const child = crossSpawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    // Keep the tail only: a chatty install must not grow memory without bound.
    const keep = (s: string, chunk: Buffer) => (s + chunk.toString()).slice(-200_000)
    // stdio is all 'pipe', so the streams always exist; the types just cannot see that.
    child.stdout!.on('data', (c: Buffer) => (stdout = keep(stdout, c)))
    child.stderr!.on('data', (c: Buffer) => (stderr = keep(stderr, c)))
    child.stdin!.on('error', () => {}) // the child may exit before reading its input
    const timer = setTimeout(() => {
      timedOut = true
      // On Windows a .cmd runs as cmd.exe -> node; killing cmd.exe alone would orphan the real process.
      if (process.platform === 'win32' && child.pid) execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {})
      else child.kill('SIGKILL')
    }, opts.timeoutMs)
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: null, stdout, stderr: err.message, timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
    child.stdin!.end(opts.input ?? '')
  })
}
